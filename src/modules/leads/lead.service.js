import { Lead } from "../../models/Lead.js";
import { httpError } from "../../utils/httpError.js";
import { paginate } from "../../utils/query.js";

async function listLeads({ page = 1, limit = 20, status, campaignId, countryCode, q }) {
  const filter = {};
  if (status) filter.status = status;
  if (campaignId) filter.campaignId = campaignId;
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
  return paginate(Lead, filter, { page, limit });
}

async function getLead(id) {
  const lead = await Lead.findById(id).lean();
  if (!lead) throw httpError("Lead not found", 404);
  return lead;
}

export { listLeads, getLead };
