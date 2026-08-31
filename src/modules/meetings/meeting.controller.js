import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ok } from "../../utils/response.js";
import { listMeetings, getSlots, scheduleMeeting, inviteGuests } from "./meeting.service.js";
import { writeAudit } from "../audit/audit.service.js";

const listController = asyncHandler(async (req, res) => {
  const data = await listMeetings({
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
    leadId: req.query.leadId,
  });
  return ok(res, data);
});

const slotsController = asyncHandler(async (req, res) => {
  const data = await getSlots(req.params.leadId);
  return ok(res, data);
});

const createSchema = z.object({
  leadId: z.string().min(8),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  notes: z.string().optional(),
});

const createController = asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const data = await scheduleMeeting(body);
  await writeAudit({
    actorId: req.user.id,
    action: "meeting.schedule",
    entityType: "meeting",
    entityId: data._id,
    metadata: { leadId: body.leadId },
    ip: req.ip,
  });
  return ok(res, data, 201);
});

const inviteSchema = z.object({
  emails: z.array(z.string().email()).min(1),
});

const inviteController = asyncHandler(async (req, res) => {
  const body = inviteSchema.parse(req.body);
  const data = await inviteGuests(req.params.id, body.emails);
  await writeAudit({
    actorId: req.user.id,
    action: "meeting.invite",
    entityType: "meeting",
    entityId: req.params.id,
    metadata: { emails: body.emails },
    ip: req.ip,
  });
  return ok(res, data);
});

export { listController, slotsController, createController, inviteController };
