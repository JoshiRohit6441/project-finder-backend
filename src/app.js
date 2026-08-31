import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/index.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { campaignRoutes } from "./modules/campaigns/campaign.routes.js";
import { jobRoutes } from "./modules/jobs/job.routes.js";
import { leadRoutes } from "./modules/leads/lead.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { mailboxRoutes } from "./modules/mailbox/mailbox.routes.js";
import { outreachRoutes } from "./modules/outreach/outreach.routes.js";
import { taskRoutes } from "./modules/tasks/task.routes.js";
import { meetingRoutes } from "./modules/meetings/meeting.routes.js";
import { publicRoutes } from "./modules/public/public.routes.js";
import { liveRoutes } from "./live/live.routes.js";
import { settingsRoutes } from "./modules/settings/settings.routes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { ok } from "./utils/response.js";
import { renderInfoPage, serviceInfo } from "./pages/rootInfo.js";

const routes = [
  ["/api/auth", authRoutes],
  ["/api/campaigns", campaignRoutes],
  ["/api/jobs", jobRoutes],
  ["/api/leads", leadRoutes],
  ["/api/dashboard", dashboardRoutes],
  ["/api/mailbox", mailboxRoutes],
  ["/api/outreach", outreachRoutes],
  ["/api/tasks", taskRoutes],
  ["/api/meetings", meetingRoutes],
  ["/api/public", publicRoutes],
  ["/api/live", liveRoutes],
  ["/api/settings", settingsRoutes],
];

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
        },
      },
    })
  );
  const listedOrigins = String(config.frontendOrigin || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  function isAllowedOrigin(origin) {
    if (!origin) return true;
    if (listedOrigins.includes(origin)) return true;
    try {
      const url = new URL(origin);
      if (url.protocol !== "https:") return false;
      const host = url.hostname;
      return host === "project-finder-frontend.vercel.app" ||
        (host.endsWith(".vercel.app") && host.startsWith("project-finder-frontend"));
    } catch {
      return false;
    }
  }

  app.use(
    cors({
      origin(origin, callback) {
        callback(null, isAllowedOrigin(origin));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (req, res) => {
    const wantsJson = req.query.format === "json" || req.accepts(["html", "json"]) === "json";
    if (wantsJson) {
      return ok(res, serviceInfo(), 200, "PROJECT FINDER API");
    }
    res.type("html").send(renderInfoPage());
  });

  app.get("/health", (_req, res) => {
    return ok(res, { status: "ok", service: "project-finder-api" }, 200, "OK");
  });

  for (const [path, router] of routes) {
    app.use(path, router);
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
