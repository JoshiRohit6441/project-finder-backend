import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ok } from "../../utils/response.js";
import { login, getProfile } from "./auth.service.js";
import { writeAudit } from "../audit/audit.service.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const loginController = asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const result = await login(body.email, body.password);
  await writeAudit({
    actorId: result.user.id,
    action: "auth.login",
    entityType: "user",
    entityId: result.user.id,
    ip: req.ip,
  });
  return ok(res, result);
});

const meController = asyncHandler(async (req, res) => {
  const profile = await getProfile(req.user.id);
  return ok(res, profile);
});

export { loginController, meController, loginSchema };
