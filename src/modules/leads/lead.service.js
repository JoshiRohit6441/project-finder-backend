import mongoose from "mongoose";
import { Lead } from "../../models/Lead.js";
import { Task } from "../../models/Task.js";
import { Meeting } from "../../models/Meeting.js";
import { Campaign } from "../../models/Campaign.js";
import { Message } from "../../models/Message.js";
import { LEAD_STATUS, TASK_STATUS, MEETING_STATUS, MESSAGE_DIRECTION, MESSAGE_STATUS, TERMINAL_LEAD_STATUSES } from "../../constants/index.js";
import { findEmail } from "../enrichment/emailFinder.js";
import { User } from "../../models/User.js";
import { QUALIFY_SCORE, missingContact } from "../outreach/policy.js";
import { isCompleteEmail, verifyEmail } from "../verification/emailVerify.js";
import { httpError } from "../../utils/httpError.js";
import { paginate } from "../../utils/query.js";
import { cancelFollowUps, getOrCreateThread, sendStoredMessage } from "../outreach/outreach.service.js";
import { getActiveMailbox } from "../mailbox/mailbox.service.js";
import { generateOutreach } from "../ai/gemini.js";
import { getRuntimeSettings, hasAiConfigured, withSenderBlock } from "../settings/settings.service.js";
import { sha256 } from "../../utils/crypto.js";
import { publishLive } from "../../live/publish.js";

const CLOSE_STATUSES = new Set([LEAD_STATUS.WON, LEAD_STATUS.LOST, LEAD_STATUS.NOT_INTERESTED]);

async function listLeads({ page = 1, limit = 20, status, campaignId, countryCode, q, needsContact, assignedTo }) {
  const filter = {};
  if (status) filter.status = status;
  if (campaignId) filter.campaignId = campaignId;
  if (needsContact === true || needsContact === "true") filter.needsContact = true;
  if (assignedTo) filter.assignedTo = assignedTo;
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
  return paginate(Lead, filter, { page, limit, populate: { path: "assignedTo", select: "name email" } });
}

async function getLead(id) {
  const lead = await Lead.findById(id)
    .populate("assignedTo", "name email")
    .populate("callLog.userId", "name email")
    .lean();
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
  if (flags.preferredChannel) lead.preferredChannel = flags.preferredChannel;
  await lead.save();
  await publishLive("leads", { leadId: String(lead._id), flags: true });
  return lead;
}

async function updateLeadContact(id, input = {}) {
  const lead = await Lead.findById(id);
  if (!lead) throw httpError("Lead not found", 404);
  if (input.email != null) {
    lead.email = String(input.email || "").trim().toLowerCase();
    lead.emailVerification = isCompleteEmail(lead.email)
      ? await verifyEmail(lead.email)
      : { syntax: false, domain: false, mx: false, risk: "missing", valid: false, checkedAt: new Date() };
  }
  if (input.phone != null) {
    lead.phone = String(input.phone || "").trim();
    lead.phoneVerified = String(lead.phone).replace(/\D/g, "").length >= 8;
  }
  if (input.whatsappOptIn != null) {
    lead.whatsappOptIn = Boolean(input.whatsappOptIn);
    lead.whatsappOptInAt = lead.whatsappOptIn ? new Date() : null;
  }
  const wasMissing = lead.needsContact;
  lead.needsContact = missingContact(lead);
  await lead.save();
  if (wasMissing && !lead.needsContact) {
    await Campaign.findByIdAndUpdate(lead.campaignId, { $inc: { "stats.needsContact": -1 } });
  }
  await publishLive("leads", { leadId: String(lead._id), contact: true });
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

async function listCallQueue({ page = 1, limit = 40, campaignId, assignedTo }) {
  const filter = {
    status: { $nin: TERMINAL_LEAD_STATUSES },
    $or: [
      { needsContact: true },
      { lastCallOutcome: { $in: ["no_answer", "callback"] } },
      { firstContactedAt: null, phone: { $ne: "" } },
    ],
  };
  if (campaignId) filter.campaignId = campaignId;
  if (assignedTo) filter.assignedTo = assignedTo;
  return paginate(Lead, filter, {
    page,
    limit,
    sort: { lastCallAt: 1, createdAt: -1 },
    populate: { path: "assignedTo", select: "name email" },
  });
}

async function addCallLog(id, input = {}, userId) {
  const lead = await Lead.findById(id);
  if (!lead) throw httpError("Lead not found", 404);
  const outcome = String(input.outcome || "reached");
  const note = String(input.note || "").trim();
  lead.callLog.push({ at: new Date(), outcome, note, userId });
  lead.lastCallAt = new Date();
  lead.lastCallOutcome = outcome;
  if (note) lead.notes = [lead.notes, note].filter(Boolean).join("\n");
  if (outcome === "not_fit") {
    lead.status = LEAD_STATUS.NOT_INTERESTED;
    lead.closedReason = note || "Not a fit after call";
    await cancelFollowUps(lead._id);
  }
  await lead.save();
  await Campaign.findByIdAndUpdate(lead.campaignId, { $inc: { "stats.called": 1 } });
  await publishLive("leads", { leadId: String(lead._id), call: true });
  return lead;
}

async function assignLead(id, assignedTo) {
  const lead = await Lead.findById(id);
  if (!lead) throw httpError("Lead not found", 404);
  if (assignedTo && !mongoose.isValidObjectId(assignedTo)) throw httpError("Invalid user", 422);
  lead.assignedTo = assignedTo || null;
  await lead.save();
  await publishLive("leads", { leadId: String(lead._id), assigned: true });
  return lead;
}

async function updateLeadNotes(id, notes) {
  const lead = await Lead.findById(id);
  if (!lead) throw httpError("Lead not found", 404);
  lead.notes = String(notes || "");
  await lead.save();
  return lead;
}

async function findLeadEmail(id) {
  const lead = await Lead.findById(id);
  if (!lead) throw httpError("Lead not found", 404);
  if (isCompleteEmail(lead.email)) return lead;
  const found = await findEmail({ website: lead.website, businessName: lead.businessName });
  if (!found) throw httpError("No email found for this website", 404);
  lead.email = found;
  lead.emailVerification = await verifyEmail(found);
  lead.needsContact = missingContact(lead);
  await lead.save();
  await Campaign.findByIdAndUpdate(lead.campaignId, { $inc: { "stats.emailsFound": 1 } });
  return lead;
}

async function listUsers() {
  const users = await User.find({ isActive: { $ne: false } }).select("name email role").sort({ name: 1 }).lean();
  return users.map((user) => ({
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
  }));
}

export {
  listLeads,
  getLead,
  approveOutreach,
  updateLeadStatus,
  updateLeadFlags,
  updateLeadContact,
  sendProposal,
  listCallQueue,
  addCallLog,
  assignLead,
  updateLeadNotes,
  findLeadEmail,
  listUsers,
};
