import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ok } from "../../utils/response.js";
import {
  listLeads,
  getLead,
  approveOutreach,
  updateLeadStatus,
  updateLeadFlags,
  updateLeadContact,
  sendProposal,
  listCallQueue,
  addCallLog,
  assignLead,
  updateLeadNotes,
  findLeadEmail,
  listUsers,
} from "./lead.service.js";
import { writeAudit } from "../audit/audit.service.js";

const listLeadsController = asyncHandler(async (req, res) => {
  const data = await listLeads({
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
    status: req.query.status,
    campaignId: req.query.campaignId,
    countryCode: req.query.countryCode,
    q: req.query.q,
    needsContact: req.query.needsContact,
    assignedTo: req.query.assignedTo,
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
  preferredChannel: z.enum(["email", "whatsapp", "both"]).optional(),
  lawfulBasis: z.string().optional(),
  consent: z.boolean().optional(),
});

const flagsController = asyncHandler(async (req, res) => {
  const body = flagsSchema.parse(req.body || {});
  const data = await updateLeadFlags(req.params.id, body);
  return ok(res, data);
});

const contactSchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
  whatsappOptIn: z.boolean().optional(),
});

const contactController = asyncHandler(async (req, res) => {
  const body = contactSchema.parse(req.body || {});
  const data = await updateLeadContact(req.params.id, body);
  await writeAudit({
    actorId: req.user.id,
    action: "lead.contact",
    entityType: "lead",
    entityId: req.params.id,
    metadata: { hasEmail: Boolean(body.email), hasPhone: Boolean(body.phone) },
    ip: req.ip,
  });
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

const callQueueController = asyncHandler(async (req, res) => {
  const data = await listCallQueue({
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 40),
    campaignId: req.query.campaignId,
    assignedTo: req.query.assignedTo,
  });
  return ok(res, data);
});

const callLogController = asyncHandler(async (req, res) => {
  const body = z
    .object({
      outcome: z.enum(["reached", "no_answer", "callback", "whatsapp_saved", "email_saved", "not_fit"]),
      note: z.string().optional().default(""),
    })
    .parse(req.body || {});
  const data = await addCallLog(req.params.id, body, req.user.id);
  return ok(res, data);
});

const assignController = asyncHandler(async (req, res) => {
  const body = z.object({ assignedTo: z.string().optional().nullable() }).parse(req.body || {});
  const data = await assignLead(req.params.id, body.assignedTo || null);
  return ok(res, data);
});

const notesController = asyncHandler(async (req, res) => {
  const body = z.object({ notes: z.string().optional().default("") }).parse(req.body || {});
  const data = await updateLeadNotes(req.params.id, body.notes);
  return ok(res, data);
});

const findEmailController = asyncHandler(async (req, res) => {
  const data = await findLeadEmail(req.params.id);
  return ok(res, data);
});

const usersController = asyncHandler(async (_req, res) => {
  return ok(res, { items: await listUsers() });
});

export {
  listLeadsController,
  getLeadController,
  approveController,
  statusController,
  flagsController,
  contactController,
  proposalController,
  callQueueController,
  callLogController,
  assignController,
  notesController,
  findEmailController,
  usersController,
};
