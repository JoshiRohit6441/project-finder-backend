import { Lead } from "../../models/Lead.js";
import { ScrapeJob } from "../../models/ScrapeJob.js";
import { Campaign } from "../../models/Campaign.js";
import { Suppression } from "../../models/Suppression.js";
import { Task } from "../../models/Task.js";
import { LEAD_STATUS, LEAD_SOURCE, JOB_STATUS, JOB_TYPES, EVENT_TYPES, PROJECT_TYPES, TASK_STATUS } from "../../constants/index.js";
import { normalizeProject } from "../leads/projects.js";
import { isCompleteEmail, verifyEmail } from "../verification/emailVerify.js";
import { decidePitch, verifyLead } from "./gemini.js";
import { snapshotWebsite } from "./websiteSnapshot.js";
import { suggestApproaches, pitchFromApproaches } from "./suggestApproaches.js";
import { upsertLeadVector } from "./qdrantStore.js";
import { enqueueJob, publishEvent } from "../../queues/streams.js";
import { publishLive } from "../../live/publish.js";
import { hasAiConfigured, getRuntimeSettings } from "../settings/settings.service.js";
import { qualifyDecision } from "../outreach/policy.js";
import { detectTimezone } from "../../utils/timezoneDetect.js";
import { logger } from "../../utils/logger.js";

async function isSuppressed(lead) {
  const checks = [];
  if (lead.email) checks.push({ type: "email", value: lead.email.toLowerCase() });
  if (lead.phone) checks.push({ type: "phone", value: String(lead.phone).toLowerCase() });
  if (lead.email) checks.push({ type: "domain", value: lead.email.split("@")[1] });
  if (!checks.length) return false;
  const found = await Suppression.findOne({ $or: checks }).lean();
  return Boolean(found);
}

async function bumpRejected(jobId, campaignId) {
  if (jobId) await ScrapeJob.findByIdAndUpdate(jobId, { $inc: { rejectedCount: 1 } });
  if (campaignId) await Campaign.findByIdAndUpdate(campaignId, { $inc: { "stats.rejected": 1 } });
  if (jobId) await publishLive("jobs", { jobId: String(jobId) });
}

async function refreshJobCounts(jobId) {
  const [qualified, verified] = await Promise.all([
    Lead.countDocuments({ jobId, status: LEAD_STATUS.QUALIFIED }),
    Lead.countDocuments({
      jobId,
      status: { $in: [LEAD_STATUS.VERIFIED, LEAD_STATUS.QUALIFIED, LEAD_STATUS.HUMAN_REVIEW_REQUIRED] },
    }),
  ]);
  const job = await ScrapeJob.findByIdAndUpdate(
    jobId,
    { qualifiedCount: qualified },
    { new: true }
  );
  if (!job) return;
  await Campaign.findByIdAndUpdate(job.campaignId, {
    $set: {
      "stats.qualified": await Lead.countDocuments({ campaignId: job.campaignId, status: LEAD_STATUS.QUALIFIED }),
      "stats.verified": await Lead.countDocuments({
        campaignId: job.campaignId,
        status: { $in: [LEAD_STATUS.VERIFIED, LEAD_STATUS.QUALIFIED, LEAD_STATUS.HUMAN_REVIEW_REQUIRED] },
      }),
    },
  });
  if (
    job.status === JOB_STATUS.COMPLETED &&
    qualified < job.targetCount &&
    job.discoveredCount < job.targetCount &&
    job.discoveredCount < job.maxScrapeLimit
  ) {
    await ScrapeJob.findByIdAndUpdate(job._id, { status: JOB_STATUS.QUEUED, completedAt: null });
    await enqueueJob(JOB_TYPES.SCRAPE, {
      jobId: String(job._id),
      campaignId: String(job.campaignId),
    });
    await publishEvent(EVENT_TYPES.JOB_NEEDS_BACKFILL, { jobId: String(job._id) });
  }
  return { qualified, verified };
}

let aiCooldownUntil = 0;

function isRateLimited(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const text = String(error?.message || "");
  return status === 429 || text.includes("429") || text.includes("Too Many Requests") || text.includes("quota");
}

function fallbackPitch(leadLike, snapshot) {
  return pitchFromApproaches(suggestApproaches(leadLike, snapshot), leadLike);
}

function withApproaches(pitch, leadLike, snapshot) {
  const heuristic = suggestApproaches(leadLike, snapshot);
  const approaches = pitch?.approaches?.length ? pitch.approaches : heuristic;
  return {
    ...pitch,
    approaches,
  };
}

async function applyPitch(leadLike) {
  const settings = await getRuntimeSettings().catch(() => ({}));
  const snapshot =
    leadLike.hasWebsite && leadLike.website
      ? await snapshotWebsite(leadLike.website, { pagespeedKey: settings.googlePlacesApiKey })
      : null;
  if (Date.now() >= aiCooldownUntil && (await hasAiConfigured())) {
    try {
      const pitch = await decidePitch(leadLike, snapshot);
      if (pitch.service === "booking_system" && snapshot?.hasBooking) {
        return { pitch: withApproaches(fallbackPitch(leadLike, snapshot), leadLike, snapshot), snapshot };
      }
      return { pitch: withApproaches(pitch, leadLike, snapshot), snapshot };
    } catch (error) {
      logger.warn({ err: error }, "pitch decision failed");
      if (isRateLimited(error)) aiCooldownUntil = Date.now() + 15 * 60 * 1000;
    }
  }
  return { pitch: withApproaches(fallbackPitch(leadLike, snapshot), leadLike, snapshot), snapshot };
}

async function reviewCandidate(raw) {
  if (!isCompleteEmail(raw.email)) {
    return { ok: false, reason: "Email is masked or incomplete" };
  }
  if (await isSuppressed(raw)) {
    return { ok: false, reason: "Contact is on the suppression list" };
  }
  if (!(await hasAiConfigured())) {
    return { ok: false, reason: "Verification unavailable" };
  }
  const emailVerification = await verifyEmail(raw.email);
  const analysis = await verifyLead(raw);
  const decision = qualifyDecision(analysis);
  if (!decision.ok) {
    return { ok: false, reason: analysis.reason || "Lead rejected by score gate" };
  }
  const { pitch, snapshot } = await applyPitch(raw);
  return {
    ok: true,
    status: decision.status,
    review: decision.review,
    emailVerification,
    analysis,
    pitch,
    websiteAudit: snapshot || {},
    timezone: detectTimezone({
      countryCode: raw.countryCode,
      location: raw.location,
      address: raw.address,
    }),
  };
}

async function queueQualifyReview(lead, reviewed) {
  const open = await Task.findOne({
    leadId: lead._id,
    classification: "qualify_below_threshold",
    status: { $in: [TASK_STATUS.OPEN, TASK_STATUS.WAITING_USER] },
  });
  const payload = {
    title: `Qualify review: ${lead.businessName} (score ${lead.leadScore})`,
    conversationSummary: reviewed.analysis?.reason || "",
    clientRequirement: "",
    aiInterpretation: reviewed.reason || `Score ${lead.leadScore} is below the auto-send gate.`,
    proposedResponse: "",
    neededFromUser: "Approve this lead for outreach or reject it. Auto-send is blocked until you approve.",
    confidence: reviewed.analysis?.confidence || 0,
    classification: "qualify_below_threshold",
  };
  if (open) {
    Object.assign(open, payload);
    await open.save();
    return open;
  }
  return Task.create({ leadId: lead._id, ...payload });
}

async function processCandidateLead(payload) {
  const raw = payload?.lead;
  const jobId = payload?.jobId || raw?.jobId;
  const campaignId = payload?.campaignId || raw?.campaignId;
  if (!raw?.fingerprint || !jobId || !campaignId) return;

  if (await Lead.findOne({ fingerprint: raw.fingerprint }).select("_id")) {
    return;
  }

  const reviewed = await reviewCandidate(raw);
  if (!reviewed.ok) {
    await bumpRejected(jobId, campaignId);
    return;
  }

  const project = normalizeProject(reviewed.pitch?.service, PROJECT_TYPES.OTHER);

  try {
    const lead = await Lead.create({
      campaignId,
      jobId,
      businessName: raw.businessName,
      category: raw.category || "",
      country: raw.country || "",
      countryCode: raw.countryCode || "",
      location: raw.location || "",
      address: raw.address || "",
      rating: raw.rating || 0,
      reviewCount: raw.reviewCount || 0,
      hasWebsite: Boolean(raw.hasWebsite),
      website: raw.website || "",
      email: raw.email,
      phone: raw.phone || "",
      sourceUrl: raw.sourceUrl || "",
      sourcePlaceId: raw.sourcePlaceId || "",
      socials: raw.socials || {},
      metadata: raw.metadata || {},
      fingerprint: raw.fingerprint,
      project,
      source: LEAD_SOURCE.SCRAPE,
      status: reviewed.status,
      leadScore: reviewed.analysis.leadScore,
      confidence: reviewed.analysis.confidence,
      aiReason: reviewed.analysis.reason,
      aiAnalysis: reviewed.analysis,
      emailVerification: reviewed.emailVerification,
      pitch: reviewed.pitch,
      approachServices: reviewed.pitch?.approaches || [],
      socials: { ...(raw.socials || {}), ...(reviewed.websiteAudit?.socials || {}) },
      websiteAudit: reviewed.websiteAudit || {},
      timezone: reviewed.timezone || "",
    });
    if (reviewed.review) {
      await queueQualifyReview(lead, reviewed);
    }
    await ScrapeJob.findByIdAndUpdate(jobId, { $inc: { discoveredCount: 1, emailsFound: 1 } });
    const campaignInc = { "stats.discovered": 1, "stats.emailsFound": 1 };
    if (reviewed.emailVerification?.valid) campaignInc["stats.emailsVerified"] = 1;
    await Campaign.findByIdAndUpdate(campaignId, { $inc: campaignInc });
    try {
      await upsertLeadVector(lead.toObject());
    } catch (error) {
      logger.warn({ err: error, leadId: lead._id }, "qdrant upsert failed");
    }
    await refreshJobCounts(jobId);
    await publishLive("jobs", { jobId: String(jobId) });
    await publishLive("leads", { leadId: String(lead._id) });
  } catch (error) {
    if (String(error.message || "").includes("duplicate")) return;
    throw error;
  }
}

async function processCreatedLead(leadId) {
  const lead = await Lead.findById(leadId);
  if (!lead || lead.status !== LEAD_STATUS.SCRAPED) return;

  const reviewed = await reviewCandidate(lead.toObject());
  if (!reviewed.ok) {
    await Lead.deleteOne({ _id: lead._id });
    await bumpRejected(lead.jobId, lead.campaignId);
    return;
  }

  lead.status = reviewed.status;
  lead.leadScore = reviewed.analysis.leadScore;
  lead.confidence = reviewed.analysis.confidence;
  lead.aiReason = reviewed.analysis.reason;
  lead.aiAnalysis = reviewed.analysis;
  lead.emailVerification = reviewed.emailVerification;
  lead.pitch = reviewed.pitch;
  lead.approachServices = reviewed.pitch?.approaches || [];
  lead.socials = { ...(lead.socials || {}), ...(reviewed.websiteAudit?.socials || {}) };
  lead.websiteAudit = reviewed.websiteAudit || {};
  if (!lead.timezone) lead.timezone = reviewed.timezone || "";
  lead.project = normalizeProject(reviewed.pitch?.service, lead.project || PROJECT_TYPES.OTHER);
  if (!lead.source) lead.source = LEAD_SOURCE.SCRAPE;
  await lead.save();
  if (reviewed.review) await queueQualifyReview(lead, reviewed);
  try {
    await upsertLeadVector(lead.toObject());
  } catch (error) {
    logger.warn({ err: error, leadId }, "qdrant upsert failed");
  }
  await refreshJobCounts(lead.jobId);
  await publishLive("jobs", { jobId: String(lead.jobId) });
  await publishLive("leads", { leadId: String(lead._id) });
}

async function rejectIncompleteEmailLeads() {
  const leads = await Lead.find({
    status: { $in: [LEAD_STATUS.SCRAPED, LEAD_STATUS.ENRICHED] },
    email: { $regex: /[*#\[\]{}<>\s]/ },
  }).select("_id jobId campaignId");
  for (const lead of leads) {
    await Lead.deleteOne({ _id: lead._id });
    await bumpRejected(lead.jobId, lead.campaignId);
  }
}

async function processPendingScrapedLeads() {
  const pending = await Lead.find({ status: LEAD_STATUS.SCRAPED }).limit(3).select("_id");
  for (const item of pending) {
    try {
      await processCreatedLead(item._id);
    } catch (error) {
      logger.warn({ err: error, leadId: item._id }, "scraped lead process failed");
    }
  }
}

async function processMissingPitches() {
  const pending = await Lead.find({
    status: { $in: [LEAD_STATUS.VERIFIED, LEAD_STATUS.QUALIFIED, LEAD_STATUS.HUMAN_REVIEW_REQUIRED] },
    $or: [
      { "pitch.service": { $in: ["", null] } },
      { pitch: { $exists: false } },
      {
        "pitch.service": "booking_system",
        "pitch.angle": /Approach them with online booking so clients can schedule/,
      },
    ],
  }).limit(8);
  for (const lead of pending) {
    try {
      const { pitch, snapshot } = await applyPitch(lead.toObject());
      if (!pitch?.service) continue;
      lead.pitch = pitch;
      lead.approachServices = pitch.approaches || [];
      lead.project = normalizeProject(pitch.service, lead.project || PROJECT_TYPES.OTHER);
      if (snapshot?.socials) lead.socials = { ...(lead.socials || {}), ...snapshot.socials };
      if (snapshot) lead.websiteAudit = snapshot;
      await lead.save();
      await publishLive("leads", { leadId: String(lead._id) });
    } catch (error) {
      logger.warn({ err: error, leadId: lead._id }, "pitch backfill failed");
    }
  }
}

export { processCreatedLead, processCandidateLead, refreshJobCounts, rejectIncompleteEmailLeads, processPendingScrapedLeads, processMissingPitches };
