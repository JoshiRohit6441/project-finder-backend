import express from "express";
import { getRuntimeSettings } from "../settings/settings.service.js";
import { verifyChallenge, processWebhook } from "./whatsapp.webhook.js";
import { logger } from "../../utils/logger.js";

const router = express.Router();

router.get("/webhook", async (req, res) => {
  const settings = await getRuntimeSettings();
  const challenge = verifyChallenge(req.query, settings);
  if (!challenge) return res.status(403).send("Forbidden");
  return res.status(200).send(challenge);
});

router.post("/webhook", async (req, res) => {
  try {
    await processWebhook(req.body || {});
  } catch (error) {
    logger.warn({ err: error }, "whatsapp webhook failed");
  }
  return res.status(200).json({ success: true });
});

export { router as whatsappRoutes };
