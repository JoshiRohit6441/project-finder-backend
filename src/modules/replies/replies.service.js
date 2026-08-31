import { Lead } from "../../models/Lead.js";
import { Campaign } from "../../models/Campaign.js";
import { Message } from "../../models/Message.js";
import { Task } from "../../models/Task.js";
import { EmailThread } from "../../models/EmailThread.js";
import { LEAD_STATUS, LEAD_SOURCE, REPLY_CLASS, HIGH_IMPACT_CLASSES, TASK_STATUS, MESSAGE_DIRECTION } from "../../constants/index.js";
import { classifyReply, generateReply } from "../ai/gemini.js";
import { cancelFollowUps, suppressEmail, getOrCreateThread, sendStoredMessage } from "../outreach/outreach.service.js";
import { getActiveMailbox } from "../mailbox/mailbox.service.js";
import { suggestSlots, withSlotTable, parseOfferedSlots, matchSlotFromReply, parseAbsoluteSlot, timezoneForCountry, buildIcs } from "../../utils/timezone.js";
import { scheduleMeeting } from "../meetings/meeting.service.js";
import { Meeting } from "../../models/Meeting.js";
import { getRuntimeSettings, hasAiConfigured, withSenderBlock } from "../settings/settings.service.js";
import { shouldSwitchProject, switchLeadProject } from "../leads/inboundLead.service.js";
import { projectLabel } from "../leads/projects.js";
import { sha256 } from "../../utils/crypto.js";
import { httpError } from "../../utils/httpError.js";

function withSender(body, settings) {
  return withSenderBlock(body, settings);
}

function appendSlotTable(body, timezone) {
  return withSlotTable(body, timezone);
}

async function historyFor(leadId) {
  const items = await Message.find({ leadId }).sort({ createdAt: 1 }).limit(20).lean();
  return items.map((item) => ({
    direction: item.direction,
    subject: item.subject,
    body: item.bodyText,
  }));
}

async function createDraftReply(lead, inbound, body, subject, keyHint) {
  const account = await getActiveMailbox();
  const thread = await getOrCreateThread(lead, account, subject);
  const key = sha256(keyHint || `reply:${inbound._id}`);
  const existing = await Message.findOne({ idempotencyKey: key });
  if (existing) return existing;
  return Message.create({
    threadId: thread._id,
    leadId: lead._id,
    accountId: account._id,
    direction: MESSAGE_DIRECTION.OUTBOUND,
    status: "draft",
    from: account.email,
    to: lead.email,
    subject,
    bodyText: body,
    idempotencyKey: key,
  });
}

async function createReviewTask(lead, inbound, analysis) {
  const open = await Task.findOne({ leadId: lead._id, status: { $in: [TASK_STATUS.OPEN, TASK_STATUS.WAITING_USER] } });
  if (open) {
    open.messageId = inbound._id;
    open.conversationSummary = analysis.summary;
    open.clientRequirement = analysis.requirement;
    open.aiInterpretation = analysis.interpretation;
    open.proposedResponse = analysis.proposedResponse;
    open.neededFromUser = analysis.neededFromUser;
    open.confidence = analysis.confidence;
    open.classification = analysis.classification;
    await open.save();
    return open;
  }
  return Task.create({
    leadId: lead._id,
    threadId: inbound.threadId,
    messageId: inbound._id,
    title: `Review reply from ${lead.businessName}`,
    status: TASK_STATUS.OPEN,
    conversationSummary: analysis.summary,
    clientRequirement: analysis.requirement,
    aiInterpretation: analysis.interpretation,
    proposedResponse: analysis.proposedResponse,
    neededFromUser: analysis.neededFromUser,
    confidence: analysis.confidence,
    classification: analysis.classification,
  });
}

function fallbackAnalysis(inbound, reason) {
  return {
    classification: REPLY_CLASS.AMBIGUOUS,
    confidence: 40,
    highImpact: true,
    summary: String(inbound.bodyText || "").slice(0, 240),
    requirement: "",
    interpretation: reason,
    proposedResponse: "",
    neededFromUser: "Review the reply and provide the next message.",
    nextAction: "human_review",
  };
}

async function handleInbound(lead, inbound) {
  if (inbound.classification) return { analysis: { classification: inbound.classification }, action: "already_handled" };

  const thread = await EmailThread.findById(inbound.threadId);
  if (thread) {
    thread.messageCount = await Message.countDocuments({ threadId: thread._id });
    thread.lastMessageAt = new Date();
    thread.lastDirection = MESSAGE_DIRECTION.INBOUND;
    await thread.save();
  }
  await Campaign.findByIdAndUpdate(lead.campaignId, { $inc: { "stats.replies": 1 } });
  await cancelFollowUps(lead._id);

  const history = await historyFor(lead._id);
  let analysis;
  if (await hasAiConfigured()) {
    try {
      analysis = await classifyReply({ lead: lead.toObject(), inbound: inbound.toObject(), history });
    } catch {
      analysis = fallbackAnalysis(inbound, "The reply could not be classified, so it needs human review.");
    }
  } else {
    analysis = fallbackAnalysis(inbound, "Default AI is not configured, so this reply needs human review.");
  }

  inbound.classification = analysis.classification;
  inbound.confidence = analysis.confidence;
  await inbound.save();

  const nextProject = shouldSwitchProject(lead, analysis, inbound);
  if (nextProject) {
    const switched = await switchLeadProject(lead, nextProject, inbound);
    const note = `They asked to change from ${projectLabel(lead.project)} to ${projectLabel(nextProject)}. Start a fresh discovery on the new project. Do not keep selling the old one.`;
    return sendAiReply(switched, inbound, { ...analysis, classification: REPLY_CLASS.ASKING_DETAILS }, [], {
      stage: "inbound",
      userNotes: note,
    });
  }

  if (analysis.classification === REPLY_CLASS.UNSUBSCRIBE || analysis.nextAction === "unsubscribe") {
    await suppressEmail(lead.email, "unsubscribe_reply");
    return { analysis, action: "unsubscribed" };
  }
  if (analysis.classification === REPLY_CLASS.NOT_INTERESTED || analysis.nextAction === "not_interested") {
    lead.status = LEAD_STATUS.NOT_INTERESTED;
    await lead.save();
    return { analysis, action: "not_interested" };
  }
  if (analysis.nextAction === "ignore" || analysis.classification === REPLY_CLASS.OUT_OF_OFFICE || analysis.classification === REPLY_CLASS.AUTOMATED) {
    lead.status = LEAD_STATUS.SNOOZED;
    await lead.save();
    return { analysis, action: "ignored" };
  }

  if (analysis.classification === REPLY_CLASS.INTERESTED) {
    await Campaign.findByIdAndUpdate(lead.campaignId, { $inc: { "stats.positiveReplies": 1 } });
  }

  const booked = await tryBookChosenSlot(lead, inbound, history);
  if (booked) return booked;

  const settings = await getRuntimeSettings();
  const needsHuman = settings.outreachRequireApproval
    ? analysis.nextAction === "human_review" ||
      analysis.highImpact ||
      HIGH_IMPACT_CLASSES.has(analysis.classification) ||
      analysis.confidence < 70
    : false;

  if (needsHuman) {
    await createReviewTask(lead, inbound, analysis);
    lead.status = LEAD_STATUS.HUMAN_REVIEW_REQUIRED;
    await lead.save();
    await Campaign.findByIdAndUpdate(lead.campaignId, { $inc: { "stats.humanReview": 1 } });
    return { analysis, action: "human_review" };
  }

  return sendAiReply(lead, inbound, analysis, history);
}

function conversationText(history, inbound) {
  return [...(history || []), inbound]
    .map((item) => `${item.direction || ""} ${item.body || item.bodyText || ""}`)
    .join("\n")
    .toLowerCase();
}

function counts(history) {
  const items = history || [];
  return {
    inbound: items.filter((item) => item.direction === "inbound").length,
    outbound: items.filter((item) => item.direction === "outbound").length,
    total: items.length,
  };
}

function readyForMeeting(history, inbound) {
  const stats = counts(history);
  return stats.inbound >= 1 && stats.outbound >= 1;
}

async function tryBookChosenSlot(lead, inbound, history) {
  const existing = await Meeting.findOne({ leadId: lead._id, status: "scheduled" });
  if (existing) return null;
  const lastOut = [...(history || [])].reverse().find((item) => item.direction === "outbound");
  const timezone = lead.timezone || timezoneForCountry(lead.countryCode) || "Asia/Kolkata";
  const generated = suggestSlots(timezone);
  const offered = lastOut?.body ? parseOfferedSlots(lastOut.body) : [];
  const chosen =
    matchSlotFromReply(inbound.bodyText, offered, generated) || parseAbsoluteSlot(inbound.bodyText, timezone);
  if (!chosen) return null;
  const meeting = await scheduleMeeting({
    leadId: lead._id,
    startAt: chosen.startAt,
    endAt: chosen.endAt,
    notes: "Booked from email slot reply",
    skipEmail: true,
  });
  const settings = await getRuntimeSettings();
  const when = `${chosen.dayLabel || chosen.dateKey} · ${chosen.label} (${chosen.timezone})`;
  const link = meeting.meetLink ? `\nMeeting link: ${meeting.meetLink}` : "";
  let body = "";
  if (await hasAiConfigured()) {
    const reply = await generateReply({
      lead: lead.toObject(),
      inbound: inbound.toObject(),
      history,
      salesContext: settings.salesContext,
      stage: "confirm",
      userNotes: `Meeting booked: ${when}.${link}`,
      sender: {
        name: settings.senderName,
        profession: settings.senderProfession,
        email: settings.senderEmail,
        whatsapp: settings.senderWhatsapp,
      },
    });
    body = withSender(reply.body, settings);
  }
  if (!body) {
    body = withSender(
      `Hello,\n\nYou are booked for a 1-hour call on ${when}.${link}\n\nI will use this time to lock the quote and start date.\n\nThanks`,
      settings
    );
  }
  body = withSender(String(body || "").split(/\nAvailable slots —/)[0].trim(), settings);
  const draft = await createDraftReply(lead, inbound, body, inbound.subject?.startsWith("Re:") ? inbound.subject : `Re: ${lead.businessName}`);
  const ics = buildIcs({
    title: meeting.title,
    startAt: meeting.startAt,
    endAt: meeting.endAt,
    description: meeting.meetLink || meeting.notes || "",
  });
  await sendStoredMessage(draft._id, { ics });
  return { analysis: { classification: "meeting_request" }, action: "meeting_scheduled", meeting };
}

async function sendAiReply(lead, inbound, analysis = {}, history, extras = {}) {
  const threadHistory = history || (await historyFor(lead._id));
  const bookMeeting = extras.forceMeeting || readyForMeeting(threadHistory, inbound);
  const collectRound = counts(threadHistory).inbound;
  const inboundFirst =
    extras.stage === "inbound" ||
    (lead.source === LEAD_SOURCE.INBOUND && counts(threadHistory).outbound === 0 && !bookMeeting);
  lead.status = LEAD_STATUS.AI_HANDLING;
  await lead.save();
  if (!lead.timezone) {
    lead.timezone = timezoneForCountry(lead.countryCode) || "Asia/Kolkata";
    await lead.save();
  }
  let body = analysis.proposedResponse || "";
  let subject = inbound.subject?.startsWith("Re:") ? inbound.subject : `Re: ${inbound.subject || lead.businessName}`;
  if (await hasAiConfigured()) {
    const settings = await getRuntimeSettings();
    const reply = await generateReply({
      lead: lead.toObject(),
      inbound: inbound.toObject(),
      history: threadHistory,
      userNotes: extras.userNotes || "",
      salesContext: settings.salesContext,
      stage: extras.stage || (bookMeeting ? "book" : inboundFirst ? "inbound" : "collect"),
      collectRound,
      sender: {
        name: settings.senderName,
        profession: settings.senderProfession,
        email: settings.senderEmail,
        whatsapp: settings.senderWhatsapp,
      },
    });
    body = reply.body;
    subject = reply.subject;
  }
  if (!String(body || "").trim()) {
    body = bookMeeting
      ? `Hello,\n\nI have enough of the scope to put a quote together. The next step is a short call so we can lock the estimate and start date.\n\nThanks`
      : `Hello,\n\nThanks for getting back to me. I can walk you through how a simple website build usually works and what the next step looks like. Happy to continue here or on WhatsApp.\n\nThanks`;
  }
  const wantsSlots = bookMeeting || /pick a slot|available (slots|options)|slot table/i.test(body);
  if (wantsSlots) {
    body = appendSlotTable(body, lead.timezone || timezoneForCountry(lead.countryCode) || "Asia/Kolkata");
  }
  const settingsForSign = await getRuntimeSettings();
  body = withSender(body, settingsForSign);
  const draft = await createDraftReply(lead, inbound, body, subject, extras.idempotencyKey);
  await sendStoredMessage(draft._id);
  lead.status = LEAD_STATUS.REPLIED;
  await lead.save();
  await Campaign.findByIdAndUpdate(lead.campaignId, { $inc: { "stats.aiHandled": 1 } });
  await Task.updateMany(
    { leadId: lead._id, status: { $in: [TASK_STATUS.OPEN, TASK_STATUS.WAITING_USER] } },
    { $set: { status: TASK_STATUS.RESOLVED, proposedResponse: body } }
  );
  return { analysis, action: "auto_replied", message: draft };
}

async function resolveTask(taskId, userNotes) {
  const task = await Task.findById(taskId);
  if (!task || task.status === TASK_STATUS.RESOLVED) {
    throw httpError("Task not found or already resolved", 404);
  }
  const lead = await Lead.findById(task.leadId);
  const inbound = task.messageId ? await Message.findById(task.messageId) : null;
  const history = await historyFor(lead._id);
  const settings = await getRuntimeSettings();
  const reply = (await hasAiConfigured())
    ? await generateReply({
        lead: lead.toObject(),
        inbound: inbound ? inbound.toObject() : { subject: "", bodyText: task.conversationSummary },
        history,
        userNotes,
        salesContext: settings.salesContext,
      })
    : { subject: `Re: ${lead.businessName}`, body: userNotes };
  reply.body = withSender(reply.body, settings);
  const draft = await createDraftReply(
    lead,
    inbound || { _id: task._id },
    reply.body,
    reply.subject
  );
  await sendStoredMessage(draft._id, { body: reply.body });
  task.status = TASK_STATUS.RESOLVED;
  task.userNotes = userNotes;
  task.proposedResponse = reply.body;
  await task.save();
  lead.status = LEAD_STATUS.REPLIED;
  await lead.save();
  return { task, message: draft };
}

export { handleInbound, resolveTask, historyFor, sendAiReply };
