import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ok } from "../../utils/response.js";
import { Message } from "../../models/Message.js";
import { EmailThread } from "../../models/EmailThread.js";
import { prepareOutreach, sendOutreachNow, sendStoredMessage, composeAndSend } from "./outreach.service.js";
import { writeAudit } from "../audit/audit.service.js";

const listThreadController = asyncHandler(async (req, res) => {
  const thread = await EmailThread.findOne({ leadId: req.params.id }).sort({ updatedAt: -1 }).lean();
  const messages = await Message.find({ leadId: req.params.id }).sort({ createdAt: 1 }).lean();
  return ok(res, { thread, messages });
});

const channelSchema = z.object({
  channel: z.enum(["email", "whatsapp"]).optional(),
  body: z.string().optional(),
  templateKind: z.enum(["intro", "followup", "meeting"]).optional(),
});

const prepareController = asyncHandler(async (req, res) => {
  const body = channelSchema.parse(req.body || {});
  const data = await prepareOutreach(req.params.id, body);
  await writeAudit({
    actorId: req.user.id,
    action: "outreach.prepare",
    entityType: "lead",
    entityId: req.params.id,
    ip: req.ip,
  });
  return ok(res, data);
});

const sendController = asyncHandler(async (req, res) => {
  const body = channelSchema.parse(req.body || {});
  const data = body.body
    ? await composeAndSend(req.params.id, body)
    : await sendOutreachNow(req.params.id, body);
  await writeAudit({
    actorId: req.user.id,
    action: "outreach.send",
    entityType: "lead",
    entityId: req.params.id,
    ip: req.ip,
  });
  return ok(res, data);
});

const approveSchema = z.object({
  body: z.string().optional(),
});

const approveController = asyncHandler(async (req, res) => {
  const body = approveSchema.parse(req.body || {});
  const data = await sendStoredMessage(req.params.messageId, { body: body.body });
  await writeAudit({
    actorId: req.user.id,
    action: "outreach.approve",
    entityType: "message",
    entityId: req.params.messageId,
    ip: req.ip,
  });
  return ok(res, data);
});

export { listThreadController, prepareController, sendController, approveController };
