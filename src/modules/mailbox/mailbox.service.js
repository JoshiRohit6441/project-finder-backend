import { google } from "googleapis";
import { EmailAccount } from "../../models/EmailAccount.js";
import { config } from "../../config/index.js";
import { encrypt, decrypt } from "../../utils/crypto.js";
import { httpError } from "../../utils/httpError.js";
import { getRuntimeSettings } from "../settings/settings.service.js";
import { warmupDailyLimit } from "../outreach/policy.js";
import { getRedis } from "../../db/redis.js";

async function oauthClient() {
  const settings = await getRuntimeSettings();
  if (!settings.oauthClientId || !settings.oauthClientSecret) {
    throw httpError("Google OAuth client ID and secret are not set", 503);
  }
  return new google.auth.OAuth2(settings.oauthClientId, settings.oauthClientSecret, config.oauth.redirectUri);
}

async function seedMailbox() {
  const settings = await getRuntimeSettings();
  if (!settings.gmailUser) return null;
  const email = settings.gmailUser.toLowerCase();
  const existing = await EmailAccount.findOne({ email });
  const authType = settings.oauthClientId && existing?.encryptedRefreshToken ? "oauth" : "app_password";
  const secret = settings.gmailAppPassword ? encrypt(settings.gmailAppPassword) : existing?.encryptedSecret || "";
  if (existing) {
    existing.fromName = settings.gmailFromName;
    existing.dailyLimit = settings.outreachDailyLimit;
    existing.hourlyLimit = settings.outreachHourlyLimit;
    if (settings.gmailAppPassword) existing.encryptedSecret = secret;
    if (existing.authType !== "oauth") existing.authType = authType;
    existing.isActive = true;
    if (!existing.warmupStartedAt) existing.warmupStartedAt = existing.createdAt || new Date();
    await existing.save();
    await syncExtraMailboxes(settings);
    return existing;
  }
  const created = await EmailAccount.create({
    email,
    fromName: settings.gmailFromName,
    authType: "app_password",
    encryptedSecret: secret,
    dailyLimit: settings.outreachDailyLimit,
    hourlyLimit: settings.outreachHourlyLimit,
    isActive: true,
    warmupStartedAt: new Date(),
    provider: "gmail",
    domain: email.split("@")[1] || "",
  });
  await syncExtraMailboxes(settings);
  return created;
}

async function syncExtraMailboxes(settings) {
  const lines = String(settings.extraSmtpAccounts || "")
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  for (const line of lines) {
    const [boxEmail, password, daily] = line.split("|").map((item) => String(item || "").trim());
    if (!boxEmail || !boxEmail.includes("@") || !password) continue;
    const email = boxEmail.toLowerCase();
    const existing = await EmailAccount.findOne({ email });
    const payload = {
      fromName: settings.gmailFromName,
      authType: "app_password",
      encryptedSecret: encrypt(password),
      dailyLimit: Number(daily) || settings.outreachDailyLimit,
      hourlyLimit: settings.outreachHourlyLimit,
      isActive: true,
      provider: "smtp",
      domain: email.split("@")[1] || "",
    };
    if (existing) {
      Object.assign(existing, payload);
      if (!existing.warmupStartedAt) existing.warmupStartedAt = existing.createdAt || new Date();
      await existing.save();
    } else {
      await EmailAccount.create({ email, warmupStartedAt: new Date(), ...payload });
    }
  }
}

async function dayCount(account) {
  try {
    const redis = getRedis();
    const dayKey = `quota:day:${account._id}:${new Date().toISOString().slice(0, 10)}`;
    return Number((await redis.get(dayKey)) || 0);
  } catch {
    return 0;
  }
}

async function pickSendableAccount() {
  await seedMailbox();
  const accounts = await EmailAccount.find({ isActive: true }).sort({ lastUsedAt: 1, updatedAt: 1 });
  if (!accounts.length) throw httpError("No active mailbox configured", 503);
  for (const account of accounts) {
    const cap = warmupDailyLimit(account.warmupStartedAt, account.dailyLimit);
    const used = await dayCount(account);
    if (used < cap) return account;
  }
  throw httpError("All mailboxes are at warmup or daily cap", 429);
}

async function getActiveMailbox() {
  const account = await EmailAccount.findOne({ isActive: true }).sort({ updatedAt: -1 });
  if (!account) throw httpError("No active mailbox configured", 503);
  return account;
}

function smtpAuth(account) {
  if (account.encryptedSecret) {
    return { user: account.email, pass: decrypt(account.encryptedSecret).replace(/\s+/g, "") };
  }
  throw httpError("Mailbox has no SMTP credentials", 503);
}

async function getMailboxStatus(account) {
  const settings = await getRuntimeSettings();
  const oauthReady = Boolean(settings.oauthClientId && settings.oauthClientSecret);
  if (!account) {
    return { connected: false, email: "", authType: "", oauthReady, oauthConnected: false };
  }
  return {
    connected: true,
    email: account.email,
    fromName: account.fromName,
    authType: account.authType,
    lastSyncAt: account.lastSyncAt,
    oauthReady,
    oauthConnected: Boolean(account.encryptedRefreshToken),
    dailyLimit: account.dailyLimit,
    hourlyLimit: account.hourlyLimit,
  };
}

async function oauthUrl() {
  const client = await oauthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://mail.google.com/",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  });
}

async function handleOAuthCallback(code) {
  const client = await oauthClient();
  const { tokens } = await client.getToken(code);
  const account = await getActiveMailbox();
  account.authType = "oauth";
  if (tokens.refresh_token) account.encryptedRefreshToken = encrypt(tokens.refresh_token);
  if (tokens.access_token) account.encryptedAccessToken = encrypt(tokens.access_token);
  if (tokens.expiry_date) account.tokenExpiry = new Date(tokens.expiry_date);
  await account.save();
  return getMailboxStatus(account);
}

async function getOAuthAuth(account) {
  if (!account.encryptedRefreshToken) return null;
  const client = await oauthClient();
  client.setCredentials({
    refresh_token: decrypt(account.encryptedRefreshToken),
    access_token: account.encryptedAccessToken ? decrypt(account.encryptedAccessToken) : undefined,
  });
  return client;
}

export { seedMailbox, getActiveMailbox, smtpAuth, getMailboxStatus, oauthUrl, handleOAuthCallback, getOAuthAuth, pickSendableAccount, syncExtraMailboxes };
