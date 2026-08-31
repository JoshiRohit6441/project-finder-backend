import { asyncHandler } from "../../utils/asyncHandler.js";
import { ok } from "../../utils/response.js";
import { createCampaign, listCampaigns, getCampaign, updateCampaignStatus } from "./campaign.service.js";
import { writeAudit } from "../audit/audit.service.js";

const createCampaignController = asyncHandler(async (req, res) => {
  const result = await createCampaign(req.body, req.user.id);
  await writeAudit({
    actorId: req.user.id,
    action: "campaign.create",
    entityType: "campaign",
    entityId: result.campaign._id,
    metadata: { name: result.campaign.name, jobs: result.jobs.length },
    ip: req.ip,
  });
  return ok(res, result, 201);
});

const listCampaignsController = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const data = await listCampaigns({ page, limit, status: req.query.status });
  return ok(res, data);
});

const getCampaignController = asyncHandler(async (req, res) => {
  const data = await getCampaign(req.params.id);
  return ok(res, data);
});

const updateCampaignStatusController = asyncHandler(async (req, res) => {
  const data = await updateCampaignStatus(req.params.id, req.body.status);
  await writeAudit({
    actorId: req.user.id,
    action: "campaign.status",
    entityType: "campaign",
    entityId: req.params.id,
    metadata: { status: req.body.status },
    ip: req.ip,
  });
  return ok(res, data);
});

export { createCampaignController, listCampaignsController, getCampaignController, updateCampaignStatusController };
