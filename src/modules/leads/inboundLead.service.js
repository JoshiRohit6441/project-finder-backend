import { Lead } from "../../models/Lead.js";
import { Campaign } from "../../models/Campaign.js";
import { ScrapeJob } from "../../models/ScrapeJob.js";
import { Message } from "../../models/Message.js";
import { EmailThread } from "../../models/EmailThread.js";
import { Meeting } from "../../models/Meeting.js";
import { User } from "../../models/User.js";
import { Suppression } from "../../models/Suppression.js";
import {
  CAMPAIGN_KIND,
  CAMPAIGN_STATUS,
  JOB_STATUS,
  LEAD_SOURCE,
  LEAD_STATUS,
  MEETING_STATUS,
  PROJECT_TYPES,
  TERMINAL_LEAD_STATUSES,
} from "../../constants/index.js";
import { cancelFollowUps, getOrCreateThread } from "../outreach/outreach.service.js";
import { getActiveMailbox } from "../mailbox/mailbox.service.js";
import { publishLive } from "../../live/publish.js";
import { sha256 } from "../../utils/crypto.js";
import { logger } from "../../utils/logger.js";
import { detectProjectFromText, normalizeProject, pitchForProject, projectLabel } from "./projects.js";

const INBOUND_CAMPAIGN_NAME = "Inbound inquiries";
const BLOCK_REOPEN = new Set([LEAD_STATUS.UNSUBSCRIBED, LEAD_STATUS.SUPPRESSED, LEAD_STATUS.NOT_INTERESTED]);

function isOpenStatus(status) {
  return !TERMINAL_LEAD_STATUSES.includes(status);
}

async function isSuppressedEmail(email) {
  if (!email) return false;
  const domain = email.split("@")[1];
  const found = await Suppression.findOne({
    $or: [
      { type: "email", value: email },
      ...(domain ? [{ type: "domain", value: domain }] : []),
    ],
  }).lean();
  return Boolean(found);
}

async function getOrCreateInboundCampaign() {
  let campaign = await Campaign.findOne({ kind: CAMPAIGN_KIND.INBOUND }).sort({ createdAt: 1 });
  if (campaign) return campaign;
  const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
  if (!admin) throw new Error("No admin user for inbound campaign");
  campaign = await Campaign.create({
    name: INBOUND_CAMPAIGN_NAME,
    kind: CAMPAIGN_KIND.INBOUND,
    project: PROJECT_TYPES.OTHER,
    status: CAMPAIGN_STATUS.ACTIVE,
    countries: [{ country: "India", countryCode: "IN", targetCount: 1, location: "" }],
    categories: ["inbound"],
    outreachMode: "both",
    filters: { minRating: 0, minReviews: 0, outreachMode: "both" },
    maxScrapeLimit: 1,
    createdBy: admin._id,
  });
  await ScrapeJob.create({
    campaignId: campaign._id,
    country: "India",
    countryCode: "IN",
    targetCount: 1,
    maxScrapeLimit: 1,
    categories: ["inbound"],
    status: JOB_STATUS.COMPLETED,
    completedAt: new Date(),
  });
  return campaign;
}

async function inboundJob(campaignId) {
  let job = await ScrapeJob.findOne({ campaignId }).sort({ createdAt: 1 });
  if (job) return job;
  return ScrapeJob.create({
    campaignId,
    country: "India",
    countryCode: "IN",
    targetCount: 1,
    maxScrapeLimit: 1,
    categories: ["inbound"],
    status: JOB_STATUS.COMPLETED,
    completedAt: new Date(),
  });
}

async function findOpenLead(email, project) {
  const filter = { email, suppressed: { $ne: true }, status: { $nin: TERMINAL_LEAD_STATUSES } };
  if (project) filter.project = project;
  return Lead.findOne(filter).sort({ updatedAt: -1 });
}

async function createInboundLead({ email, businessName, project, parentLeadId, subject, bodyText }) {
  const campaign = await getOrCreateInboundCampaign();
  const job = await inboundJob(campaign._id);
  const nextProject = normalizeProject(project, PROJECT_TYPES.OTHER);
  const open = await findOpenLead(email, nextProject);
  if (open) return open;
  const lead = await Lead.create({
    campaignId: campaign._id,
    jobId: job._id,
    businessName: businessName || email.split("@")[0] || "Inbound lead",
    category: "inbound",
    country: "India",
    countryCode: "IN",
    email,
    fingerprint: sha256(`inbound:${email}:${nextProject}:${Date.now()}`),
    project: nextProject,
    source: LEAD_SOURCE.INBOUND,
    parentLeadId: parentLeadId || null,
    status: LEAD_STATUS.REPLIED,
    leadScore: 70,
    confidence: 80,
    aiReason: parentLeadId
      ? `Switched from a previous lead to ${projectLabel(nextProject)}.`
      : `Inbound enquiry for ${projectLabel(nextProject)}.`,
    pitch: pitchForProject(nextProject, businessName),
    emailVerification: { syntax: true, domain: true, mx: true, risk: "low", valid: true, checkedAt: new Date() },
    metadata: { inboundSubject: subject || "", inboundPreview: String(bodyText || "").slice(0, 240) },
  });
  await Campaign.findByIdAndUpdate(campaign._id, {
    $inc: { "stats.discovered": 1, "stats.verified": 1, "stats.qualified": 1, "stats.emailsFound": 1 },
  });
  await ScrapeJob.findByIdAndUpdate(job._id, { $inc: { discoveredCount: 1, qualifiedCount: 1, emailsFound: 1 } });
  await publishLive("leads", { leadId: String(lead._id), source: LEAD_SOURCE.INBOUND, project: nextProject });
  logger.info({ leadId: String(lead._id), email, project: nextProject, parentLeadId: parentLeadId ? String(parentLeadId) : "" }, "inbound lead created");
  return lead;
}

async function closeLeadForSwitch(lead, nextProject) {
  lead.status = LEAD_STATUS.CLOSED_SWITCHED;
  lead.closedReason = `Client asked for ${projectLabel(nextProject)} instead.`;
  await lead.save();
  await cancelFollowUps(lead._id);
  await Meeting.updateMany(
    { leadId: lead._id, status: MEETING_STATUS.SCHEDULED },
    { $set: { status: MEETING_STATUS.CANCELLED } }
  );
}

async function moveInboundToLead(inbound, lead) {
  const account = await getActiveMailbox();
  const thread = await getOrCreateThread(lead, account, inbound.subject || `${projectLabel(lead.project)} enquiry`);
  inbound.leadId = lead._id;
  inbound.threadId = thread._id;
  inbound.accountId = inbound.accountId || account._id;
  await inbound.save();
  const oldThreads = await EmailThread.find({ leadId: lead._id, _id: { $ne: thread._id } });
  for (const item of oldThreads) {
    item.messageCount = await Message.countDocuments({ threadId: item._id });
    await item.save();
  }
  thread.messageCount = await Message.countDocuments({ threadId: thread._id });
  thread.lastMessageAt = new Date();
  thread.lastDirection = inbound.direction;
  await thread.save();
  return inbound;
}

function shouldSwitchProject(lead, analysis, inbound) {
  if (!lead || BLOCK_REOPEN.has(lead.status)) return "";
  const requested = normalizeProject(analysis?.requestedProject, "");
  const detected = detectProjectFromText(inbound?.subject, inbound?.bodyText);
  let next = "";
  if (requested && requested !== PROJECT_TYPES.OTHER) next = requested;
  else if (analysis?.projectSwitch && detected && detected !== PROJECT_TYPES.OTHER) next = detected;
  if (!next || next === lead.project) return "";
  if (analysis?.projectSwitch) return next;
  if (["interested", "asking_details", "asking_pricing", "clarification"].includes(analysis?.classification)) {
    return next;
  }
  return "";
}

async function switchLeadProject(lead, nextProject, inbound) {
  const project = normalizeProject(nextProject, PROJECT_TYPES.OTHER);
  await closeLeadForSwitch(lead, project);
  const created = await createInboundLead({
    email: lead.email,
    businessName: lead.businessName,
    project,
    parentLeadId: lead._id,
    subject: inbound?.subject,
    bodyText: inbound?.bodyText,
  });
  if (inbound) await moveInboundToLead(inbound, created);
  logger.info({ fromLeadId: String(lead._id), toLeadId: String(created._id), project }, "lead switched project");
  return created;
}

async function resolveChildOrOpen(lead) {
  if (!lead || isOpenStatus(lead.status)) return lead;
  const child = await Lead.findOne({ parentLeadId: lead._id, status: { $nin: TERMINAL_LEAD_STATUSES } }).sort({ createdAt: -1 });
  if (child) return child;
  if (BLOCK_REOPEN.has(lead.status) || lead.suppressed) return lead;
  return null;
}

export {
  isOpenStatus,
  isSuppressedEmail,
  getOrCreateInboundCampaign,
  findOpenLead,
  createInboundLead,
  shouldSwitchProject,
  switchLeadProject,
  resolveChildOrOpen,
  BLOCK_REOPEN,
};
