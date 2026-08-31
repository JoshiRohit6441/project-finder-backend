import express from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ok } from "../../utils/response.js";
import { verifyUnsubscribe } from "../../utils/jwt.js";
import { suppressEmail } from "../outreach/outreach.service.js";

const router = express.Router();

router.post(
  "/unsubscribe",
  asyncHandler(async (req, res) => {
    const email = verifyUnsubscribe(req.body.token || req.query.token);
    await suppressEmail(email, "opt_out");
    return ok(res, { unsubscribed: true, email });
  })
);

export { router as publicRoutes };
