import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ok } from "../../utils/response.js";
import { listLeads, getLead, approveOutreach, updateLeadStatus, updateLeadFlags, sendProposal } from "./lead.service.js";
import { writeAudit } from "../audit/audit.service.js";

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

const approveController = asyncHandler(async (req, res) => {
  const data = await approveOutreach(req.params.id);
  await writeAudit({
    actorId: req.user.id,
    action: "lead.approve_outreach",
    entityType: "lead",
    entityId: req.params.id,
    ip: req.ip,
  });
  return ok(res, data);
});

const statusSchema = z.object({
  status: z.enum(["qualified", "interested", "won", "lost", "not_interested"]),
  reason: z.string().optional().default(""),
});

const statusController = asyncHandler(async (req, res) => {
  const body = statusSchema.parse(req.body || {});
  const data = await updateLeadStatus(req.params.id, body.status, body.reason);
  await writeAudit({
    actorId: req.user.id,
    action: "lead.status",
    entityType: "lead",
    entityId: req.params.id,
    metadata: body,
    ip: req.ip,
  });
  return ok(res, data);
});

const flagsSchema = z.object({
  phoneVerified: z.boolean().optional(),
  whatsappOptIn: z.boolean().optional(),
  lawfulBasis: z.string().optional(),
  consent: z.boolean().optional(),
});

const flagsController = asyncHandler(async (req, res) => {
  const body = flagsSchema.parse(req.body || {});
  const data = await updateLeadFlags(req.params.id, body);
  return ok(res, data);
});

const proposalSchema = z.object({
  notes: z.string().optional().default(""),
});

const proposalController = asyncHandler(async (req, res) => {
  const body = proposalSchema.parse(req.body || {});
  const data = await sendProposal(req.params.id, body.notes);
  await writeAudit({
    actorId: req.user.id,
    action: "lead.proposal",
    entityType: "lead",
    entityId: req.params.id,
    ip: req.ip,
  });
  return ok(res, data);
});

export { listLeadsController, getLeadController, approveController, statusController, flagsController, proposalController };
