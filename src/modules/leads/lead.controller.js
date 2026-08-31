import { asyncHandler } from "../../utils/asyncHandler.js";
import { ok } from "../../utils/response.js";
import { listLeads, getLead } from "./lead.service.js";

const listLeadsController = asyncHandler(async (req, res) => {
  const data = await listLeads({
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
    status: req.query.status,
    campaignId: req.query.campaignId,
    countryCode: req.query.countryCode,
    q: req.query.q,
  });
  return ok(res, data);
});

const getLeadController = asyncHandler(async (req, res) => {
  const data = await getLead(req.params.id);
  return ok(res, data);
});

export { listLeadsController, getLeadController };
