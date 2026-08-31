import { google } from "googleapis";
import { EmailAccount } from "../../models/EmailAccount.js";
import { config } from "../../config/index.js";
import { encrypt, decrypt } from "../../utils/crypto.js";
import { httpError } from "../../utils/httpError.js";
import { getRuntimeSettings } from "../settings/settings.service.js";

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
  await EmailAccount.updateMany({ email: { $ne: email } }, { $set: { isActive: false } });
  if (existing) {
    existing.fromName = settings.gmailFromName;
    existing.dailyLimit = settings.outreachDailyLimit;
    existing.hourlyLimit = settings.outreachHourlyLimit;
    if (settings.gmailAppPassword) existing.encryptedSecret = secret;
    if (existing.authType !== "oauth") existing.authType = authType;
    existing.isActive = true;
    await existing.save();
    return existing;
  }
  return EmailAccount.create({
    email,
    fromName: settings.gmailFromName,
    authType: "app_password",
    encryptedSecret: secret,
    dailyLimit: settings.outreachDailyLimit,
    hourlyLimit: settings.outreachHourlyLimit,
    isActive: true,
  });
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

export { seedMailbox, getActiveMailbox, smtpAuth, getMailboxStatus, oauthUrl, handleOAuthCallback, getOAuthAuth };
