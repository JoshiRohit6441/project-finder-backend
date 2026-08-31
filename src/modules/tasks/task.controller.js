import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ok } from "../../utils/response.js";
import { listTasks, getTask, resolveTask } from "./task.service.js";
import { writeAudit } from "../audit/audit.service.js";

const listController = asyncHandler(async (req, res) => {
  const data = await listTasks({
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
    status: req.query.status,
  });
  return ok(res, data);
});

const getController = asyncHandler(async (req, res) => {
  const data = await getTask(req.params.id);
  return ok(res, data);
});

const resolveSchema = z.object({
  notes: z.string().min(2),
});

const resolveController = asyncHandler(async (req, res) => {
  const body = resolveSchema.parse(req.body);
  const data = await resolveTask(req.params.id, body.notes);
  await writeAudit({
    actorId: req.user.id,
    action: "task.resolve",
    entityType: "task",
    entityId: req.params.id,
    ip: req.ip,
  });
  return ok(res, data);
});

export { listController, getController, resolveController };
