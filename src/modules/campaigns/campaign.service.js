import { Campaign } from "../../models/Campaign.js";
import { ScrapeJob } from "../../models/ScrapeJob.js";
import { Lead } from "../../models/Lead.js";
import { CAMPAIGN_STATUS, JOB_STATUS, JOB_TYPES, LEAD_SOURCE, LEAD_STATUS, PROJECT_TYPES, TERMINAL_LEAD_STATUSES } from "../../constants/index.js";
import { normalizeProject, pitchForProject } from "../leads/projects.js";
import { enqueueJob } from "../../queues/streams.js";
import { publishLive } from "../../live/publish.js";
import { httpError } from "../../utils/httpError.js";
import { paginate } from "../../utils/query.js";
import { sha256 } from "../../utils/crypto.js";

function emailFilters(filters = {}) {
  return { ...filters, requireEmail: true };
}

async function createCampaign(payload, userId) {
  const campaign = await Campaign.create({
    name: payload.name,
    project: normalizeProject(payload.project, PROJECT_TYPES.NEW_WEBSITE),
    status: CAMPAIGN_STATUS.ACTIVE,
    countries: payload.countries,
    categories: payload.categories,
    filters: emailFilters(payload.filters),
    maxScrapeLimit: payload.maxScrapeLimit,
    createdBy: userId,
  });

  const jobs = await ScrapeJob.insertMany(
    payload.countries.map((item) => ({
      campaignId: campaign._id,
      country: item.country,
      countryCode: item.countryCode,
      location: item.location || "",
      targetCount: item.targetCount,
      maxScrapeLimit: payload.maxScrapeLimit,
      categories: payload.categories,
      filters: emailFilters(payload.filters),
      status: JOB_STATUS.QUEUED,
    }))
  );

  await Promise.all(
    jobs.map((job) =>
      enqueueJob(JOB_TYPES.SCRAPE, {
        jobId: String(job._id),
        campaignId: String(campaign._id),
      })
    )
  );
  await publishLive("jobs", { campaignId: String(campaign._id) });

  return { campaign, jobs };
}

async function listCampaigns({ page = 1, limit = 20, status }) {
  const result = await paginate(Campaign, status ? { status } : {}, { page, limit });
  for (const item of result.items) {
    if (item.status !== CAMPAIGN_STATUS.ACTIVE && item.status !== CAMPAIGN_STATUS.PAUSED) continue;
    const completed = await maybeCompleteCampaign(item._id);
    if (completed) item.status = completed.status;
  }
  return result;
}

const OPEN_JOBS = new Set([JOB_STATUS.QUEUED, JOB_STATUS.RUNNING, JOB_STATUS.PAUSED]);

async function maybeCompleteCampaign(campaignId) {
  const jobs = await ScrapeJob.find({ campaignId }).select("status").lean();
  if (!jobs.length || jobs.some((job) => OPEN_JOBS.has(job.status))) return null;
  return Campaign.findOneAndUpdate(
    { _id: campaignId, status: { $in: [CAMPAIGN_STATUS.ACTIVE, CAMPAIGN_STATUS.PAUSED] } },
    { $set: { status: CAMPAIGN_STATUS.COMPLETED } },
    { new: true }
  ).lean();
}

async function getCampaign(id) {
  let campaign = await Campaign.findById(id).lean();
  if (!campaign) throw httpError("Campaign not found", 404);
  if (campaign.status === CAMPAIGN_STATUS.ACTIVE || campaign.status === CAMPAIGN_STATUS.PAUSED) {
    const completed = await maybeCompleteCampaign(id);
    if (completed) campaign = completed;
  }
  const jobs = await ScrapeJob.find({ campaignId: id }).sort({ createdAt: -1 }).lean();
  return { ...campaign, jobs };
}

async function updateCampaignStatus(id, status) {
  const campaign = await Campaign.findByIdAndUpdate(id, { status }, { new: true }).lean();
  if (!campaign) throw httpError("Campaign not found", 404);
  if (status === CAMPAIGN_STATUS.PAUSED || status === CAMPAIGN_STATUS.CANCELLED) {
    const jobStatus = status === CAMPAIGN_STATUS.CANCELLED ? JOB_STATUS.CANCELLED : JOB_STATUS.PAUSED;
    await ScrapeJob.updateMany(
      { campaignId: id, status: { $in: [JOB_STATUS.QUEUED, JOB_STATUS.RUNNING] } },
      { status: jobStatus }
    );
    await publishLive("jobs", { campaignId: String(id) });
  }
  return campaign;
}

async function createManualCampaign(name, userId, project = PROJECT_TYPES.NEW_WEBSITE) {
  return Campaign.create({
    name,
    project: normalizeProject(project, PROJECT_TYPES.NEW_WEBSITE),
    status: CAMPAIGN_STATUS.ACTIVE,
    countries: [{ country: "India", countryCode: "IN", targetCount: 1, location: "" }],
    categories: ["website"],
    filters: { requireEmail: true, minRating: 0, minReviews: 0, excludeWithWebsite: false, requirePhone: false },
    maxScrapeLimit: 1,
    createdBy: userId,
  });
}

async function addManualLead(campaignId, input) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw httpError("Campaign not found", 404);
  let job = await ScrapeJob.findOne({ campaignId }).sort({ createdAt: 1 });
  if (!job) {
    job = await ScrapeJob.create({
      campaignId,
      country: campaign.countries[0]?.country || "India",
      countryCode: campaign.countries[0]?.countryCode || "IN",
      targetCount: 1,
      maxScrapeLimit: campaign.maxScrapeLimit || 1,
      categories: campaign.categories,
      status: JOB_STATUS.COMPLETED,
      completedAt: new Date(),
    });
  }
  const email = String(input.email || "").toLowerCase().trim();
  const project = normalizeProject(input.project || input.pitch?.service || campaign.project, PROJECT_TYPES.NEW_WEBSITE);
  const source = input.source || LEAD_SOURCE.MANUAL;
  const fingerprint = sha256(`${source}:${email}:${project}:${Date.now()}`);
  const existing = await Lead.findOne({
    email,
    project,
    status: { $nin: TERMINAL_LEAD_STATUSES },
  });
  if (existing) return existing;
  const lead = await Lead.create({
    campaignId,
    jobId: job._id,
    businessName: input.businessName,
    category: input.category || "",
    country: input.country || campaign.countries[0]?.country || "India",
    countryCode: input.countryCode || campaign.countries[0]?.countryCode || "IN",
    location: input.location || "",
    hasWebsite: Boolean(input.website),
    website: input.website || "",
    email,
    fingerprint,
    project,
    source,
    status: LEAD_STATUS.QUALIFIED,
    leadScore: 80,
    confidence: 90,
    aiReason: input.aiReason || "Manual test lead",
    pitch: input.pitch?.service ? input.pitch : pitchForProject(project, input.businessName),
    emailVerification: { syntax: true, domain: true, mx: true, risk: "low", valid: true, checkedAt: new Date() },
  });
  await Campaign.findByIdAndUpdate(campaignId, {
    $inc: { "stats.discovered": 1, "stats.verified": 1, "stats.qualified": 1, "stats.emailsFound": 1, "stats.emailsVerified": 1 },
  });
  await ScrapeJob.findByIdAndUpdate(job._id, { $inc: { discoveredCount: 1, qualifiedCount: 1, emailsFound: 1 } });
  await publishLive("leads", { leadId: String(lead._id) });
  return lead;
}

export { createCampaign, listCampaigns, getCampaign, updateCampaignStatus, maybeCompleteCampaign, createManualCampaign, addManualLead };
