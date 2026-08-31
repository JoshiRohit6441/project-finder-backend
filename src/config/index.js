import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(here, "../../.env") });
dotenv.config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  mongoUri: required("MONGO_URI", "mongodb://127.0.0.1:27017/projectfinder"),
  redisUrl: required("REDIS_URL", "redis://127.0.0.1:6379"),
  qdrantUrl: required("QDRANT_URL", "http://127.0.0.1:6333"),
  jwtSecret: required("JWT_SECRET", "dev-jwt-secret-change-in-production"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  admin: {
    email: required("ADMIN_EMAIL", "admin@localhost.com"),
    password: required("ADMIN_PASSWORD", "Admin@12345"),
    name: process.env.ADMIN_NAME || "Admin",
  },
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    model:
      process.env.GEMINI_MODEL === "gemini-2.0-flash"
        ? "gemini-3.6-flash"
        : process.env.GEMINI_MODEL || "gemini-3.6-flash",
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004",
  },
  googlePlacesKey: process.env.GOOGLE_PLACES_API_KEY || "",
  encryptionKey: required("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef"),
  logLevel: process.env.LOG_LEVEL || "info",
  publicAppUrl: process.env.PUBLIC_APP_URL || process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  gmail: {
    user: process.env.GMAIL_USER || "",
    appPassword: (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, ""),
    fromName: process.env.GMAIL_FROM_NAME || "Project Finder",
  },
  oauth: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:4000/api/mailbox/oauth/callback",
  },
  outreach: {
    requireApproval: String(process.env.OUTREACH_REQUIRE_APPROVAL || "true") === "true",
    dailyLimit: Number(process.env.OUTREACH_DAILY_LIMIT || 40),
    hourlyLimit: Number(process.env.OUTREACH_HOURLY_LIMIT || 8),
    salesContext:
      process.env.OUTREACH_SALES_CONTEXT ||
      "We build web applications for local businesses using WordPress, Node.js, Express, MongoDB, React, and Next.js. If they already have a site, we offer a focused upgrade. If they do not, we offer a new website or custom web app. Do not invent case studies, prices, or facts that are not provided.",
  },
  followUp: {
    maxAttempts: Number(process.env.FOLLOWUP_MAX_ATTEMPTS || 3),
    intervalDays: Number(process.env.FOLLOWUP_INTERVAL_DAYS || 3),
    hoursStart: Number(process.env.FOLLOWUP_HOURS_START || 9),
    hoursEnd: Number(process.env.FOLLOWUP_HOURS_END || 18),
    holidays: (process.env.FOLLOWUP_HOLIDAYS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  },
};
