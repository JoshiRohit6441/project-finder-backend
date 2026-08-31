import { Lead } from "../../models/Lead.js";
import { Campaign } from "../../models/Campaign.js";
import { EmailThread } from "../../models/EmailThread.js";
import { Message } from "../../models/Message.js";
import { FollowUp } from "../../models/FollowUp.js";
import { Suppression } from "../../models/Suppression.js";
import { LEAD_STATUS, MESSAGE_STATUS, MESSAGE_DIRECTION, FOLLOWUP_STATUS, EVENT_TYPES, TERMINAL_LEAD_STATUSES } from "../../constants/index.js";
import { decidePitch, generateOutreach, generateFollowUp } from "../ai/gemini.js";
import { snapshotWebsite } from "../ai/websiteSnapshot.js";
import { isCompleteEmail } from "../verification/emailVerify.js";
import { sendMail } from "../mailbox/mailer.js";
import { getActiveMailbox } from "../mailbox/mailbox.service.js";
import { timezoneForCountry, nextBusinessTime, withSlotTable } from "../../utils/timezone.js";
import { signUnsubscribe } from "../../utils/jwt.js";
import { config } from "../../config/index.js";
import { getRuntimeSettings, hasAiConfigured, withSenderBlock } from "../settings/settings.service.js";
import { publishEvent } from "../../queues/streams.js";
import { publishLive } from "../../live/publish.js";
import { sha256 } from "../../utils/crypto.js";
import { httpError } from "../../utils/httpError.js";

const TERMINAL = new Set(TERMINAL_LEAD_STATUSES);

async function ensurePitch(lead) {
  if (lead.pitch?.service || !(await hasAiConfigured())) return lead;
  try {
    const snapshot = lead.hasWebsite && lead.website ? await snapshotWebsite(lead.website) : null;
    lead.pitch = await decidePitch(lead.toObject(), snapshot);
    await lead.save();
  } catch {
    return lead;
  }
  return lead;
}

async function assertSendable(lead) {
  if (!isCompleteEmail(lead.email)) throw httpError("Lead email is masked or incomplete", 422);
  if (lead.suppressed || TERMINAL.has(lead.status)) {
    throw httpError("Lead is not eligible for outreach", 409);
  }
  const suppressed = await Suppression.findOne({
    $or: [{ type: "email", value: lead.email }, { type: "domain", value: lead.email.split("@")[1] }],
  }).lean();
  if (suppressed) throw httpError("Contact is suppressed", 409);
}

async function getOrCreateThread(lead, account, subject) {
  let thread = await EmailThread.findOne({ leadId: lead._id });
  if (!thread) {
    thread = await EmailThread.create({
      leadId: lead._id,
      campaignId: lead.campaignId,
      accountId: account._id,
      subject,
    });
  }
  return thread;
}

function unsubscribeUrl(email) {
  const token = signUnsubscribe(email);
  return `${config.publicAppUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
}

function withSender(body, settings) {
  return withSenderBlock(body, settings);
}

function withFooter(body, url) {
  return `${body.trim()}\n\n---\nIf you prefer not to receive further emails, unsubscribe here: ${url}`;
}

async function prepareOutreach(leadId) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw httpError("Lead not found", 404);
  await assertSendable(lead);
  await ensurePitch(lead);
  if (!lead.timezone) lead.timezone = timezoneForCountry(lead.countryCode);
  const settings = await getRuntimeSettings();
  const account = await getActiveMailbox();
  const draft = (await hasAiConfigured())
    ? await generateOutreach({
        lead: lead.toObject(),
        salesContext: settings.salesContext,
        sender: {
          name: settings.senderName,
          profession: settings.senderProfession,
          email: settings.senderEmail,
          whatsapp: settings.senderWhatsapp,
        },
      })
    : {
        subject: `Quick question about ${lead.businessName}`,
        body: `Hello,\n\nI came across ${lead.businessName}${lead.location ? ` in ${lead.location}` : ""} and wanted to ask whether a simple professional website would be useful. I help local businesses with that work.\n\nHappy to share a short outline if that is of interest.\n\nThanks`,
      };
  if (/pick a slot|available (slots|options)|1-hour call/i.test(draft.body)) {
    draft.body = withSlotTable(draft.body, lead.timezone || timezoneForCountry(lead.countryCode) || "Asia/Kolkata");
  }
  draft.body = withSender(draft.body, settings);
  const thread = await getOrCreateThread(lead, account, draft.subject);
  const key = sha256(`outreach:${lead._id}:${thread._id}`);
  const existing = await Message.findOne({ idempotencyKey: key });
  if (existing) return { lead, thread, message: existing };
  const message = await Message.create({
    threadId: thread._id,
    leadId: lead._id,
    accountId: account._id,
    direction: MESSAGE_DIRECTION.OUTBOUND,
    status: MESSAGE_STATUS.DRAFT,
    from: account.email,
    to: lead.email,
    subject: draft.subject,
    bodyText: draft.body,
    idempotencyKey: key,
  });
  thread.subject = draft.subject;
  thread.messageCount += 1;
  thread.lastDirection = MESSAGE_DIRECTION.OUTBOUND;
  await thread.save();
  if (!settings.outreachRequireApproval) {
    await publishEvent(EVENT_TYPES.OUTREACH_SEND, { messageId: String(message._id) });
  } else if (lead.status === LEAD_STATUS.QUALIFIED) {
    lead.status = LEAD_STATUS.READY_FOR_OUTREACH;
    await lead.save();
  }
  await publishLive("mailbox", { messageId: String(message._id), leadId: String(lead._id) });
  return { lead, thread, message };
}

async function sendStoredMessage(messageId, extras = {}) {
  const message = await Message.findById(messageId);
  if (!message) throw httpError("Message not found", 404);
  if (message.status === MESSAGE_STATUS.SENT) return message;
  const lead = await Lead.findById(message.leadId);
  await assertSendable(lead);
  const thread = await EmailThread.findById(message.threadId);
  const previous = await Message.find({ threadId: thread._id, status: MESSAGE_STATUS.SENT }).sort({ createdAt: 1 });
  const lastOutbound = [...previous].reverse().find((item) => item.direction === MESSAGE_DIRECTION.OUTBOUND);
  const refs = previous.map((item) => item.internetMessageId).filter(Boolean);
  const url = unsubscribeUrl(lead.email);
  const result = await sendMail({
    to: lead.email,
    subject: message.subject,
    text: withFooter(extras.body || message.bodyText, url),
    inReplyTo: lastOutbound?.internetMessageId || "",
    references: refs,
    unsubscribeUrl: url,
    ics: extras.ics,
  });
  message.status = result.rejected?.length ? MESSAGE_STATUS.FAILED : MESSAGE_STATUS.SENT;
  message.internetMessageId = result.messageId || "";
  message.sentAt = new Date();
  message.error = result.rejected?.length ? "Rejected by provider" : "";
  if (extras.body) message.bodyText = extras.body;
  await message.save();
  thread.lastMessageAt = new Date();
  thread.lastDirection = MESSAGE_DIRECTION.OUTBOUND;
  await thread.save();
  lead.status = LEAD_STATUS.CONTACTED;
  lead.lastContactedAt = new Date();
  await lead.save();
  await Campaign.findByIdAndUpdate(lead.campaignId, { $inc: { "stats.outreachSent": 1 } });
  await scheduleFollowUp(lead, thread);
  await publishLive("mailbox", { messageId: String(message._id), leadId: String(lead._id), sent: true });
  return message;
}

async function sendOutreachNow(leadId) {
  const prepared = await prepareOutreach(leadId);
  if (prepared.message.status === MESSAGE_STATUS.DRAFT) {
    return sendStoredMessage(prepared.message._id);
  }
  return prepared.message;
}

async function scheduleFollowUp(lead, thread) {
  const settings = await getRuntimeSettings();
  if (lead.followUpCount >= settings.followUpMaxAttempts) {
    lead.status = LEAD_STATUS.FOLLOW_UP_EXHAUSTED;
    await lead.save();
    await FollowUp.updateMany({ leadId: lead._id, status: FOLLOWUP_STATUS.SCHEDULED }, { status: FOLLOWUP_STATUS.EXHAUSTED });
    return null;
  }
  await FollowUp.updateMany({ leadId: lead._id, status: FOLLOWUP_STATUS.SCHEDULED }, { status: FOLLOWUP_STATUS.CANCELLED });
  const timezone = lead.timezone || timezoneForCountry(lead.countryCode);
  const raw = new Date(Date.now() + settings.followUpIntervalDays * 24 * 60 * 60 * 1000);
  const nextAt = nextBusinessTime(raw, timezone);
  return FollowUp.create({
    leadId: lead._id,
    threadId: thread._id,
    attempt: lead.followUpCount + 1,
    nextAt,
    timezone,
    status: FOLLOWUP_STATUS.SCHEDULED,
  });
}

async function cancelFollowUps(leadId) {
  await FollowUp.updateMany({ leadId, status: FOLLOWUP_STATUS.SCHEDULED }, { status: FOLLOWUP_STATUS.CANCELLED });
}

async function processDueFollowUps() {
  const due = await FollowUp.find({ status: FOLLOWUP_STATUS.SCHEDULED, nextAt: { $lte: new Date() } }).limit(10);
  for (const item of due) {
    const lead = await Lead.findById(item.leadId);
    if (!lead || TERMINAL.has(lead.status) || lead.status === LEAD_STATUS.REPLIED || lead.status === LEAD_STATUS.AI_HANDLING || lead.status === LEAD_STATUS.HUMAN_REVIEW_REQUIRED || lead.status === LEAD_STATUS.MEETING_SCHEDULED) {
      item.status = FOLLOWUP_STATUS.CANCELLED;
      await item.save();
      continue;
    }
    try {
      await assertSendable(lead);
      const settings = await getRuntimeSettings();
      const content = (await hasAiConfigured())
        ? await generateFollowUp({
            lead: lead.toObject(),
            attempt: item.attempt,
            salesContext: settings.salesContext,
            sender: {
              name: settings.senderName,
              profession: settings.senderProfession,
              email: settings.senderEmail,
              whatsapp: settings.senderWhatsapp,
            },
          })
        : { subject: `Following up — ${lead.businessName}`, body: `Hello,\n\nJust checking in to see if you had a chance to read my previous note about a website for ${lead.businessName}. Happy to share more detail if useful.\n\nThanks` };
      content.body = withSender(content.body, settings);
      const account = await getActiveMailbox();
      const thread = await getOrCreateThread(lead, account, content.subject);
      const message = await Message.create({
        threadId: thread._id,
        leadId: lead._id,
        accountId: account._id,
        direction: MESSAGE_DIRECTION.OUTBOUND,
        status: MESSAGE_STATUS.DRAFT,
        from: account.email,
        to: lead.email,
        subject: content.subject,
        bodyText: content.body,
        idempotencyKey: sha256(`followup:${lead._id}:${item.attempt}`),
      });
      await sendStoredMessage(message._id);
      item.status = FOLLOWUP_STATUS.SENT;
      await item.save();
      lead.followUpCount = item.attempt;
      await lead.save();
    } catch (error) {
      item.status = FOLLOWUP_STATUS.CANCELLED;
      await item.save();
    }
  }
}

async function suppressEmail(email, reason = "opt_out") {
  const value = String(email || "").toLowerCase();
  if (!value) return;
  await Suppression.updateOne({ type: "email", value }, { $set: { type: "email", value, reason, source: "recipient" } }, { upsert: true });
  await Lead.updateMany({ email: value }, { $set: { status: LEAD_STATUS.UNSUBSCRIBED, suppressed: true } });
  const leads = await Lead.find({ email: value }).select("_id");
  await Promise.all(leads.map((item) => cancelFollowUps(item._id)));
}

export { prepareOutreach, sendOutreachNow, sendStoredMessage, processDueFollowUps, cancelFollowUps, suppressEmail, unsubscribeUrl, getOrCreateThread };
