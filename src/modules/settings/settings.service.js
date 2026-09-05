import { Settings } from "../../models/Settings.js";
import { config } from "../../config/index.js";
import { encrypt, decrypt } from "../../utils/crypto.js";
import { getRedis } from "../../db/redis.js";

const SETTINGS_ID = "app";
const SECRETS = [
  "geminiApiKey",
  "openaiApiKey",
  "googlePlacesApiKey",
  "gmailAppPassword",
  "oauthClientSecret",
  "instantlyApiKey",
  "smartleadApiKey",
  "whatsappAccessToken",
  "inboxWebhookSecret",
  "whatsappVerifyToken",
  "hunterApiKey",
];

let snapshot = null;
let cachedAt = 0;

function envDefaults() {
  return {
    defaultAi: "gemini",
    geminiApiKey: config.gemini.apiKey,
    geminiModel: config.gemini.model,
    geminiEmbeddingModel: config.gemini.embeddingModel,
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    openaiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    googlePlacesApiKey: config.googlePlacesKey,
    gmailUser: config.gmail.user,
    gmailAppPassword: config.gmail.appPassword,
    gmailFromName: config.gmail.fromName,
    oauthClientId: config.oauth.clientId,
    oauthClientSecret: config.oauth.clientSecret,
    senderName: process.env.SENDER_NAME || "",
    senderProfession: process.env.SENDER_PROFESSION || "",
    senderEmail: process.env.SENDER_EMAIL || "",
    senderWhatsapp: process.env.SENDER_WHATSAPP || "",
    senderPostalAddress: process.env.SENDER_POSTAL_ADDRESS || "",
    sendingProvider: process.env.SENDING_PROVIDER || "gmail",
    instantlyApiKey: process.env.INSTANTLY_API_KEY || "",
    smartleadApiKey: process.env.SMARTLEAD_API_KEY || "",
    smartleadCampaignId: process.env.SMARTLEAD_CAMPAIGN_ID || "",
    extraSmtpAccounts: process.env.EXTRA_SMTP_ACCOUNTS || "",
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    whatsappBusinessId: process.env.WHATSAPP_BUSINESS_ID || "",
    whatsappTemplateName: process.env.WHATSAPP_TEMPLATE_NAME || "",
    whatsappTemplateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
    whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    whatsappFollowupTemplate: process.env.WHATSAPP_FOLLOWUP_TEMPLATE || "",
    whatsappMeetingTemplate: process.env.WHATSAPP_MEETING_TEMPLATE || "",
    hunterApiKey: process.env.HUNTER_API_KEY || "",
    outreachLanguage: process.env.OUTREACH_LANGUAGE || "auto",
    inboxWebhookSecret: process.env.INBOX_WEBHOOK_SECRET || "",
    outreachRequireApproval: config.outreach.requireApproval,
    createLeadsFromInbox: false,
    outreachDailyLimit: config.outreach.dailyLimit,
    outreachHourlyLimit: config.outreach.hourlyLimit,
    salesContext: config.outreach.salesContext,
    followUpMaxAttempts: config.followUp.maxAttempts,
    followUpIntervalDays: config.followUp.intervalDays,
    followUpHoursStart: config.followUp.hoursStart,
    followUpHoursEnd: config.followUp.hoursEnd,
    followUpHolidays: config.followUp.holidays.join(", "),
  };
}

function maskSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 4) return "••••";
  return `••••${text.slice(-4)}`;
}

function looksMasked(value) {
  return !value || String(value).startsWith("••••");
}

function readSecret(stored) {
  if (!stored) return "";
  try {
    return decrypt(stored);
  } catch {
    return stored;
  }
}

async function getSettingsDoc() {
  let doc = await Settings.findById(SETTINGS_ID);
  if (doc) return doc;
  const defaults = envDefaults();
  const payload = { _id: SETTINGS_ID, ...defaults };
  for (const key of SECRETS) {
    payload[key] = defaults[key] ? encrypt(defaults[key]) : "";
  }
  return Settings.create(payload);
}

function toRuntime(doc) {
  const defaults = envDefaults();
  const value = (key) => {
    if (SECRETS.includes(key)) return readSecret(doc[key]) || "";
    if (doc[key] === undefined || doc[key] === null) return defaults[key];
    return doc[key];
  };
  const holidays = String(value("followUpHolidays") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    defaultAi: value("defaultAi") === "openai" ? "openai" : "gemini",
    geminiApiKey: value("geminiApiKey"),
    geminiModel: value("geminiModel"),
    geminiEmbeddingModel: value("geminiEmbeddingModel"),
    openaiApiKey: value("openaiApiKey"),
    openaiModel: value("openaiModel"),
    openaiEmbeddingModel: value("openaiEmbeddingModel"),
    googlePlacesApiKey: value("googlePlacesApiKey"),
    gmailUser: value("gmailUser"),
    gmailAppPassword: value("gmailAppPassword"),
    gmailFromName: value("gmailFromName"),
    oauthClientId: value("oauthClientId") || defaults.oauthClientId,
    oauthClientSecret: value("oauthClientSecret") || defaults.oauthClientSecret,
    senderName: value("senderName"),
    senderProfession: value("senderProfession"),
    senderEmail: value("senderEmail"),
    senderWhatsapp: value("senderWhatsapp"),
    senderPostalAddress: value("senderPostalAddress"),
    sendingProvider: ["gmail", "instantly", "smartlead"].includes(value("sendingProvider"))
      ? value("sendingProvider")
      : "gmail",
    instantlyApiKey: value("instantlyApiKey"),
    smartleadApiKey: value("smartleadApiKey"),
    smartleadCampaignId: value("smartleadCampaignId"),
    extraSmtpAccounts: value("extraSmtpAccounts"),
    whatsappPhoneNumberId: value("whatsappPhoneNumberId"),
    whatsappAccessToken: value("whatsappAccessToken"),
    whatsappBusinessId: value("whatsappBusinessId"),
    whatsappTemplateName: value("whatsappTemplateName"),
    whatsappTemplateLanguage: value("whatsappTemplateLanguage") || "en",
    whatsappVerifyToken: value("whatsappVerifyToken"),
    whatsappFollowupTemplate: value("whatsappFollowupTemplate"),
    whatsappMeetingTemplate: value("whatsappMeetingTemplate"),
    hunterApiKey: value("hunterApiKey"),
    outreachLanguage: value("outreachLanguage") || "auto",
    inboxWebhookSecret: value("inboxWebhookSecret"),
    outreachRequireApproval: Boolean(value("outreachRequireApproval")),
    createLeadsFromInbox: Boolean(value("createLeadsFromInbox")),
    outreachDailyLimit: Number(value("outreachDailyLimit")),
    outreachHourlyLimit: Number(value("outreachHourlyLimit")),
    salesContext: value("salesContext"),
    followUpMaxAttempts: Number(value("followUpMaxAttempts")),
    followUpIntervalDays: Number(value("followUpIntervalDays")),
    followUpHoursStart: Number(value("followUpHoursStart")),
    followUpHoursEnd: Number(value("followUpHoursEnd")),
    followUpHolidays: holidays,
  };
}

async function cachePlacesKey(key) {
  try {
    const redis = getRedis();
    if (key) await redis.set("settings:googlePlacesKey", key);
    else await redis.del("settings:googlePlacesKey");
  } catch {
    return;
  }
}

async function getRuntimeSettings() {
  if (snapshot && Date.now() - cachedAt < 4000) return snapshot;
  const doc = await getSettingsDoc();
  snapshot = toRuntime(doc);
  cachedAt = Date.now();
  await cachePlacesKey(snapshot.googlePlacesApiKey);
  return snapshot;
}

function getSettingsSnapshot() {
  if (snapshot) return snapshot;
  const defaults = envDefaults();
  return {
    ...defaults,
    followUpHolidays: String(defaults.followUpHolidays || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

function publicView(runtime) {
  return {
    defaultAi: runtime.defaultAi,
    geminiApiKey: maskSecret(runtime.geminiApiKey),
    geminiModel: runtime.geminiModel,
    geminiEmbeddingModel: runtime.geminiEmbeddingModel,
    geminiConfigured: Boolean(runtime.geminiApiKey),
    openaiApiKey: maskSecret(runtime.openaiApiKey),
    openaiModel: runtime.openaiModel,
    openaiEmbeddingModel: runtime.openaiEmbeddingModel,
    openaiConfigured: Boolean(runtime.openaiApiKey),
    googlePlacesApiKey: maskSecret(runtime.googlePlacesApiKey),
    gmailUser: runtime.gmailUser,
    gmailAppPassword: maskSecret(runtime.gmailAppPassword),
    gmailFromName: runtime.gmailFromName,
    oauthClientId: runtime.oauthClientId,
    oauthClientSecret: maskSecret(runtime.oauthClientSecret),
    senderName: runtime.senderName,
    senderProfession: runtime.senderProfession,
    senderEmail: runtime.senderEmail,
    senderWhatsapp: runtime.senderWhatsapp,
    senderPostalAddress: runtime.senderPostalAddress,
    sendingProvider: runtime.sendingProvider,
    instantlyApiKey: maskSecret(runtime.instantlyApiKey),
    smartleadApiKey: maskSecret(runtime.smartleadApiKey),
    smartleadCampaignId: runtime.smartleadCampaignId,
    extraSmtpAccounts: runtime.extraSmtpAccounts,
    whatsappPhoneNumberId: runtime.whatsappPhoneNumberId,
    whatsappAccessToken: maskSecret(runtime.whatsappAccessToken),
    whatsappBusinessId: runtime.whatsappBusinessId,
    whatsappTemplateName: runtime.whatsappTemplateName,
    whatsappTemplateLanguage: runtime.whatsappTemplateLanguage,
    whatsappVerifyToken: maskSecret(runtime.whatsappVerifyToken),
    whatsappFollowupTemplate: runtime.whatsappFollowupTemplate,
    whatsappMeetingTemplate: runtime.whatsappMeetingTemplate,
    hunterApiKey: maskSecret(runtime.hunterApiKey),
    outreachLanguage: runtime.outreachLanguage || "auto",
    inboxWebhookSecret: maskSecret(runtime.inboxWebhookSecret),
    outreachRequireApproval: runtime.outreachRequireApproval,
    createLeadsFromInbox: Boolean(runtime.createLeadsFromInbox),
    outreachDailyLimit: runtime.outreachDailyLimit,
    outreachHourlyLimit: runtime.outreachHourlyLimit,
    salesContext: runtime.salesContext,
    followUpMaxAttempts: runtime.followUpMaxAttempts,
    followUpIntervalDays: runtime.followUpIntervalDays,
    followUpHoursStart: runtime.followUpHoursStart,
    followUpHoursEnd: runtime.followUpHoursEnd,
    followUpHolidays: runtime.followUpHolidays.join(", "),
  };
}

async function getPublicSettings() {
  return publicView(await getRuntimeSettings());
}

async function saveSettings(input) {
  const current = await getRuntimeSettings();
  const payload = {
    defaultAi: input.defaultAi === "openai" ? "openai" : "gemini",
    geminiModel: input.geminiModel,
    geminiEmbeddingModel: input.geminiEmbeddingModel,
    openaiModel: input.openaiModel,
    openaiEmbeddingModel: input.openaiEmbeddingModel,
    gmailUser: String(input.gmailUser || "").trim(),
    gmailFromName: String(input.gmailFromName || "").trim(),
    oauthClientId: String(input.oauthClientId || "").trim(),
    senderName: String(input.senderName || "").trim(),
    senderProfession: String(input.senderProfession || "").trim(),
    senderEmail: String(input.senderEmail || "").trim(),
    senderWhatsapp: String(input.senderWhatsapp || "").trim(),
    senderPostalAddress: String(input.senderPostalAddress || "").trim(),
    sendingProvider: ["gmail", "instantly", "smartlead"].includes(input.sendingProvider)
      ? input.sendingProvider
      : "gmail",
    smartleadCampaignId: String(input.smartleadCampaignId || "").trim(),
    extraSmtpAccounts: String(input.extraSmtpAccounts || "").trim(),
    whatsappPhoneNumberId: String(input.whatsappPhoneNumberId || "").trim(),
    whatsappBusinessId: String(input.whatsappBusinessId || "").trim(),
    whatsappTemplateName: String(input.whatsappTemplateName || "").trim(),
    whatsappTemplateLanguage: String(input.whatsappTemplateLanguage || "en").trim() || "en",
    whatsappFollowupTemplate: String(input.whatsappFollowupTemplate || "").trim(),
    whatsappMeetingTemplate: String(input.whatsappMeetingTemplate || "").trim(),
    outreachLanguage: ["auto", "en", "hi"].includes(input.outreachLanguage) ? input.outreachLanguage : "auto",
    outreachRequireApproval: Boolean(input.outreachRequireApproval),
    createLeadsFromInbox: Boolean(input.createLeadsFromInbox),
    outreachDailyLimit: Number(input.outreachDailyLimit),
    outreachHourlyLimit: Number(input.outreachHourlyLimit),
    salesContext: String(input.salesContext || "").trim(),
    followUpMaxAttempts: Number(input.followUpMaxAttempts),
    followUpIntervalDays: Number(input.followUpIntervalDays),
    followUpHoursStart: Number(input.followUpHoursStart),
    followUpHoursEnd: Number(input.followUpHoursEnd),
    followUpHolidays: String(input.followUpHolidays || ""),
  };
  for (const key of SECRETS) {
    const raw = looksMasked(input[key]) ? current[key] : String(input[key] || "").trim();
    payload[key] = raw ? encrypt(raw) : "";
  }
  await Settings.findByIdAndUpdate(SETTINGS_ID, { $set: payload }, { upsert: true });
  snapshot = null;
  cachedAt = 0;
  return getPublicSettings();
}

async function hasAiConfigured() {
  const settings = await getRuntimeSettings();
  return settings.defaultAi === "openai" ? Boolean(settings.openaiApiKey) : Boolean(settings.geminiApiKey);
}

function senderSignature(settings) {
  const lines = [];
  if (settings.senderName) lines.push(settings.senderName);
  if (settings.senderProfession) lines.push(settings.senderProfession);
  if (settings.senderEmail) lines.push(`Email: ${settings.senderEmail}`);
  if (settings.senderWhatsapp) {
    const digits = String(settings.senderWhatsapp).replace(/\D/g, "");
    const wa = digits.length === 10 ? `91${digits}` : digits;
    lines.push(`WhatsApp: ${settings.senderWhatsapp}`);
    if (wa) lines.push(`https://wa.me/${wa}`);
  }
  if (settings.senderPostalAddress) lines.push(settings.senderPostalAddress);
  return lines.join("\n");
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripAiSignOff(body, settings) {
  let text = String(body || "").replace(/\r/g, "").trim();
  const sign = senderSignature(settings);
  if (sign && text.includes(sign)) text = text.replace(sign, "").trim();
  if (settings?.senderEmail) {
    text = text.replace(new RegExp(`\\n*Email:\\s*${escapeRegex(settings.senderEmail)}[\\s\\S]*$`, "i"), "").trim();
  }
  if (settings?.senderName) {
    const name = escapeRegex(settings.senderName);
    const profession = escapeRegex(settings.senderProfession || "");
    text = text.replace(
      new RegExp(`\\n*(?:best regards|kind regards|warm regards|regards|thanks|thank you)[,\\s]*\\n(?:${name}[\\s\\S]*)$`, "i"),
      ""
    ).trim();
    text = text.replace(new RegExp(`\\n*${name}(?:,\\s*${profession})?\\s*$`, "i"), "").trim();
  }
  return text.trim();
}

function withSenderBlock(body, settings) {
  const cleaned = stripAiSignOff(body, settings);
  const sign = senderSignature(settings);
  if (!sign) return cleaned;
  return `${cleaned}\n\n${sign}`;
}

export { getRuntimeSettings, getSettingsSnapshot, getPublicSettings, saveSettings, hasAiConfigured, senderSignature, stripAiSignOff, withSenderBlock };
