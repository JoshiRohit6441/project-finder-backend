import express from "express";
import Redis from "ioredis";
import { verifyToken } from "../utils/jwt.js";
import { User } from "../models/User.js";
import { config } from "../config/index.js";
import { LIVE_CHANNEL } from "./publish.js";
import { fail } from "../utils/response.js";

const router = express.Router();

async function requireStreamAuth(req, res, next) {
  const token = req.query.token || "";
  if (!token) return fail(res, "Authentication required", 401);
  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).lean();
    if (!user || !user.isActive) return fail(res, "Invalid session", 401);
    req.user = { id: String(user._id), role: user.role };
    return next();
  } catch {
    return fail(res, "Invalid or expired token", 401);
  }
}

router.get("/stream", requireStreamAuth, async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  res.write(`event: ready\ndata: {}\n\n`);

  const sub = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  await sub.subscribe(LIVE_CHANNEL);
  const onMessage = (channel, message) => {
    if (channel !== LIVE_CHANNEL) return;
    try {
      const parsed = JSON.parse(message);
      res.write(`event: ${parsed.event}\ndata: ${JSON.stringify(parsed.data || {})}\n\n`);
    } catch {
      res.write(`event: message\ndata: ${message}\n\n`);
    }
  };
  sub.on("message", onMessage);
  const ping = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 20000);

  req.on("close", () => {
    clearInterval(ping);
    sub.off("message", onMessage);
    sub.quit();
  });
});

export { router as liveRoutes };
