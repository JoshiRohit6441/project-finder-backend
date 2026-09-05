import { Lead } from "../../models/Lead.js";
import { Task } from "../../models/Task.js";
import { Meeting } from "../../models/Meeting.js";
import { Campaign } from "../../models/Campaign.js";
import { Message } from "../../models/Message.js";
import { LEAD_STATUS, TASK_STATUS, MEETING_STATUS, MESSAGE_DIRECTION, MESSAGE_STATUS } from "../../constants/index.js";
import { QUALIFY_SCORE } from "../outreach/policy.js";
import { httpError } from "../../utils/httpError.js";
import { paginate } from "../../utils/query.js";
import { cancelFollowUps, getOrCreateThread, sendStoredMessage } from "../outreach/outreach.service.js";
import { getActiveMailbox } from "../mailbox/mailbox.service.js";
import { generateOutreach } from "../ai/gemini.js";
import { getRuntimeSettings, hasAiConfigured, withSenderBlock } from "../settings/settings.service.js";
import { sha256 } from "../../utils/crypto.js";
import { publishLive } from "../../live/publish.js";

const CLOSE_STATUSES = new Set([LEAD_STATUS.WON, LEAD_STATUS.LOST, LEAD_STATUS.NOT_INTERESTED]);

async function listLeads({ page = 1, limit = 20, status, campaignId, countryCode, q }) {
  const filter = {};
  if (status) filter.status = status;
  if (campaignId) filter.campaignId = campaignId;
  if (countryCode) filter.countryCode = String(countryCode).toUpperCase();
  if (q) {
    filter.$or = [
      { businessName: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { category: { $regex: q, $options: "i" } },
      { location: { $regex: q, $options: "i" } },
      { project: { $regex: q, $options: "i" } },
    ];
  }
  return paginate(Lead, filter, { page, limit });
}

async function getLead(id) {
  const lead = await Lead.findById(id).lean();
  if (!lead) throw httpError("Lead not found", 404);
  return lead;
}

async function approveOutreach(id) {
  const lead = await Lead.findById(id);
  if (!lead) throw httpError("Lead not found", 404);
  lead.status = LEAD_STATUS.QUALIFIED;
  if (Number(lead.leadScore || 0) < QUALIFY_SCORE) lead.leadScore = QUALIFY_SCORE;
  lead.aiReason = `${lead.aiReason || ""} Human approved for outreach.`.trim();
  await lead.save();
  await Task.updateMany(
    { leadId: lead._id, classification: "qualify_below_threshold", status: { $in: [TASK_STATUS.OPEN, TASK_STATUS.WAITING_USER] } },
    { $set: { status: TASK_STATUS.RESOLVED, userNotes: "Approved for outreach" } }
  );
  await publishLive("leads", { leadId: String(lead._id), approved: true });
  return lead;
}

async function updateLeadStatus(id, status, reason = "") {
  const lead = await Lead.findById(id);
  if (!lead) throw httpError("Lead not found", 404);
  const allowed = new Set([
    LEAD_STATUS.QUALIFIED,
    LEAD_STATUS.INTERESTED,
    LEAD_STATUS.WON,
    LEAD_STATUS.LOST,
    LEAD_STATUS.NOT_INTERESTED,
  ]);
  if (!allowed.has(status)) throw httpError("Unsupported status change", 422);
  lead.status = status;
  if (reason) lead.closedReason = reason;
  await lead.save();
  if (CLOSE_STATUSES.has(status)) {
    await cancelFollowUps(lead._id);
    if (status === LEAD_STATUS.WON) {
      await Campaign.findByIdAndUpdate(lead.campaignId, { $inc: { "stats.conversions": 1 } });
    }
  }
  await publishLive("leads", { leadId: String(lead._id), status });
  return lead;
}

async function updateLeadFlags(id, flags = {}) {
  const lead = await Lead.findById(id);
  if (!lead) throw httpError("Lead not found", 404);
  if (flags.phoneVerified != null) lead.phoneVerified = Boolean(flags.phoneVerified);
  if (flags.whatsappOptIn != null) {
    lead.whatsappOptIn = Boolean(flags.whatsappOptIn);
    lead.whatsappOptInAt = lead.whatsappOptIn ? new Date() : null;
  }
  if (flags.lawfulBasis != null) lead.lawfulBasis = String(flags.lawfulBasis || "");
  if (flags.consent === true) lead.consentAt = new Date();
  await lead.save();
  await publishLive("leads", { leadId: String(lead._id), flags: true });
  return lead;
}

async function sendProposal(id, notes = "") {
  const lead = await Lead.findById(id);
  if (!lead) throw httpError("Lead not found", 404);
  const settings = await getRuntimeSettings();
  const draft = (await hasAiConfigured())
    ? await generateOutreach({
        lead: {
          ...lead.toObject(),
          pitch: {
            ...(lead.pitch || {}),
            angle: notes || "Post-meeting proposal. Recap the agreed scope and ask them to confirm so work can start.",
            talkingPoints: ["Scope recap", "Next step to start", "No invented price"],
          },
        },
        salesContext: `${settings.salesContext}\nThis is a post-meeting proposal email. Do not invent a price. Ask them to confirm the scope.`,
        sender: {
          name: settings.senderName,
          profession: settings.senderProfession,
          email: settings.senderEmail,
          whatsapp: settings.senderWhatsapp,
        },
      })
    : {
        subject: `Proposal follow-up — ${lead.businessName}`,
        body: `Hello,\n\nThank you for the call. I am sending a short recap of the website work we discussed${notes ? `: ${notes}` : "."}\n\nReply here if you want me to lock the start date.\n\nThanks`,
      };
  draft.body = withSenderBlock(draft.body, settings);
  const account = await getActiveMailbox();
  const thread = await getOrCreateThread(lead, account, draft.subject);
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
    idempotencyKey: sha256(`proposal:${lead._id}:${Date.now()}`),
  });
  await sendStoredMessage(message._id);
  lead.proposalSentAt = new Date();
  if (lead.status === LEAD_STATUS.MEETING_SCHEDULED) lead.status = LEAD_STATUS.INTERESTED;
  await lead.save();
  await Meeting.updateMany(
    { leadId: lead._id, status: MEETING_STATUS.SCHEDULED, endAt: { $lte: new Date() } },
    { $set: { status: MEETING_STATUS.COMPLETED } }
  );
  await publishLive("leads", { leadId: String(lead._id), proposal: true });
  return { lead, message };
}

export { listLeads, getLead, approveOutreach, updateLeadStatus, updateLeadFlags, sendProposal };
