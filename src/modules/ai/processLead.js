import { Lead } from "../../models/Lead.js";
import { ScrapeJob } from "../../models/ScrapeJob.js";
import { Campaign } from "../../models/Campaign.js";
import { Suppression } from "../../models/Suppression.js";
import { LEAD_STATUS, LEAD_SOURCE, JOB_STATUS, JOB_TYPES, EVENT_TYPES, PROJECT_TYPES } from "../../constants/index.js";
import { normalizeProject } from "../leads/projects.js";
import { isCompleteEmail, verifyEmail } from "../verification/emailVerify.js";
import { decidePitch, verifyLead } from "./gemini.js";
import { snapshotWebsite } from "./websiteSnapshot.js";
import { upsertLeadVector } from "./qdrantStore.js";
import { enqueueJob, publishEvent } from "../../queues/streams.js";
import { publishLive } from "../../live/publish.js";
import { hasAiConfigured } from "../settings/settings.service.js";
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
    Lead.countDocuments({ jobId, status: { $in: [LEAD_STATUS.VERIFIED, LEAD_STATUS.QUALIFIED] } }),
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
        status: { $in: [LEAD_STATUS.VERIFIED, LEAD_STATUS.QUALIFIED] },
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
  const category = String(leadLike.category || "this business");
  const hasSite = Boolean(leadLike.hasWebsite || leadLike.website);
  const bookingType = /clinic|dental|dentist|salon|gym|spa|restaurant/i.test(category);
  const hasBooking = Boolean(snapshot?.hasBooking);
  if (hasSite && bookingType && snapshot && !hasBooking) {
    return {
      service: "booking_system",
      label: "Online booking",
      stack: "WordPress",
      angle: `${leadLike.businessName} has a site but no clear online booking. Approach them with a booking flow on the existing site.`,
      talkingPoints: [
        "Add online booking on the existing site",
        "Cut phone-tag for appointments",
        "Keep the current look and add a simple booking flow",
      ],
    };
  }
  if (hasSite) {
    return {
      service: "website_upgrade",
      label: "Website upgrade",
      stack: "WordPress",
      angle: `${leadLike.businessName} already has a website${hasBooking ? " with online booking" : ""}. Approach them with a focused upgrade, not a new booking product.`,
      talkingPoints: [
        "Improve mobile layout and how services are explained",
        "Make contact and location easier to find",
        "Keep the current site and upgrade the weak parts",
      ],
    };
  }
  return {
    service: "new_website",
    label: "New website",
    stack: "WordPress",
    angle: `${leadLike.businessName} does not have a clear website. Approach them with a simple professional site for ${category}.`,
    talkingPoints: [
      "A clear site with services, location, and contact",
      "Mobile-friendly pages that look trustworthy",
      "A contact path so enquiries do not get lost",
    ],
  };
}

async function applyPitch(leadLike) {
  const snapshot = leadLike.hasWebsite && leadLike.website ? await snapshotWebsite(leadLike.website) : null;
  if (Date.now() >= aiCooldownUntil && (await hasAiConfigured())) {
    try {
      const pitch = await decidePitch(leadLike, snapshot);
      if (pitch.service === "booking_system" && snapshot?.hasBooking) {
        return fallbackPitch(leadLike, snapshot);
      }
      return pitch;
    } catch (error) {
      logger.warn({ err: error }, "pitch decision failed");
      if (isRateLimited(error)) aiCooldownUntil = Date.now() + 15 * 60 * 1000;
    }
  }
  return fallbackPitch(leadLike, snapshot);
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
  if (analysis.recommendedStatus === "invalid" || analysis.spamProbability >= 70) {
    return { ok: false, reason: analysis.reason };
  }
  const status =
    analysis.recommendedStatus === "qualified" && analysis.leadScore >= 70
      ? LEAD_STATUS.QUALIFIED
      : LEAD_STATUS.VERIFIED;
  const pitch = await applyPitch(raw);
  return { ok: true, status, emailVerification, analysis, pitch };
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

  const campaign = await Campaign.findById(campaignId).select("project").lean();
  const project = normalizeProject(campaign?.project || reviewed.pitch?.service, PROJECT_TYPES.NEW_WEBSITE);

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
    });
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
  if (!lead.project) lead.project = normalizeProject(reviewed.pitch?.service, PROJECT_TYPES.NEW_WEBSITE);
  if (!lead.source) lead.source = LEAD_SOURCE.SCRAPE;
  await lead.save();
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
    status: { $in: [LEAD_STATUS.VERIFIED, LEAD_STATUS.QUALIFIED] },
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
      const pitch = await applyPitch(lead.toObject());
      if (!pitch?.service) continue;
      lead.pitch = pitch;
      await lead.save();
      await publishLive("leads", { leadId: String(lead._id) });
    } catch (error) {
      logger.warn({ err: error, leadId: lead._id }, "pitch backfill failed");
    }
  }
}

export { processCreatedLead, processCandidateLead, refreshJobCounts, rejectIncompleteEmailLeads, processPendingScrapedLeads, processMissingPitches };
