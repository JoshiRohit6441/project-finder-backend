import { asyncHandler } from "../../utils/asyncHandler.js";
import { ok } from "../../utils/response.js";
import { listJobs, getJob, cancelJob, retryJob } from "./job.service.js";
import { writeAudit } from "../audit/audit.service.js";

const listJobsController = asyncHandler(async (req, res) => {
  const data = await listJobs({
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
    status: req.query.status,
    campaignId: req.query.campaignId,
  });
  return ok(res, data);
});

const getJobController = asyncHandler(async (req, res) => {
  const data = await getJob(req.params.id);
  return ok(res, data);
});

const cancelJobController = asyncHandler(async (req, res) => {
  const data = await cancelJob(req.params.id);
  await writeAudit({
    actorId: req.user.id,
    action: "job.cancel",
    entityType: "scrape_job",
    entityId: req.params.id,
    ip: req.ip,
  });
  return ok(res, data);
});

const retryJobController = asyncHandler(async (req, res) => {
  const data = await retryJob(req.params.id);
  await writeAudit({
    actorId: req.user.id,
    action: "job.retry",
    entityType: "scrape_job",
    entityId: req.params.id,
    ip: req.ip,
  });
  return ok(res, data);
});

export { listJobsController, getJobController, cancelJobController, retryJobController };
