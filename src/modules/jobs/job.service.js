import { ScrapeJob } from "../../models/ScrapeJob.js";
import { JOB_STATUS, JOB_TYPES } from "../../constants/index.js";
import { enqueueJob } from "../../queues/streams.js";
import { publishLive } from "../../live/publish.js";
import { httpError } from "../../utils/httpError.js";
import { paginate } from "../../utils/query.js";

async function listJobs({ page = 1, limit = 20, status, campaignId }) {
  const filter = {};
  if (status) filter.status = status;
  if (campaignId) filter.campaignId = campaignId;
  return paginate(ScrapeJob, filter, { page, limit });
}

async function getJob(id) {
  const job = await ScrapeJob.findById(id).lean();
  if (!job) throw httpError("Job not found", 404);
  return job;
}

async function cancelJob(id) {
  const job = await ScrapeJob.findOneAndUpdate(
    { _id: id, status: { $in: [JOB_STATUS.QUEUED, JOB_STATUS.RUNNING, JOB_STATUS.PAUSED] } },
    { status: JOB_STATUS.CANCELLED, completedAt: new Date() },
    { new: true }
  ).lean();
  if (!job) throw httpError("Job cannot be cancelled", 409);
  await publishLive("jobs", { jobId: String(job._id) });
  return job;
}

async function retryJob(id) {
  const job = await ScrapeJob.findOneAndUpdate(
    { _id: id, status: { $in: [JOB_STATUS.FAILED, JOB_STATUS.CANCELLED] } },
    {
      status: JOB_STATUS.QUEUED,
      error: "",
      completedAt: null,
    },
    { new: true }
  ).lean();
  if (!job) throw httpError("Job cannot be retried", 409);
  await enqueueJob(JOB_TYPES.SCRAPE, {
    jobId: String(job._id),
    campaignId: String(job.campaignId),
  });
  await publishLive("jobs", { jobId: String(job._id) });
  return job;
}

export { listJobs, getJob, cancelJob, retryJob };
