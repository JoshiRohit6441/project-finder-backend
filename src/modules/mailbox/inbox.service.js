import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { EmailAccount } from "../../models/EmailAccount.js";
import { Message } from "../../models/Message.js";
import { Lead } from "../../models/Lead.js";
import { MESSAGE_DIRECTION, MESSAGE_STATUS } from "../../constants/index.js";
import { getActiveMailbox, smtpAuth, getOAuthAuth } from "./mailbox.service.js";
import { handleInbound } from "../replies/replies.service.js";
import { getOrCreateThread } from "../outreach/outreach.service.js";
import {
  createInboundLead,
  isSuppressedEmail,
  resolveChildOrOpen,
  findOpenLead,
} from "../leads/inboundLead.service.js";
import { detectProjectFromText } from "../leads/projects.js";
import { getRuntimeSettings } from "../settings/settings.service.js";
import { logger } from "../../utils/logger.js";
import { httpError } from "../../utils/httpError.js";
import { sha256 } from "../../utils/crypto.js";
import { publishLive } from "../../live/publish.js";

function extractDisplayName(value, email) {
  if (!value) return email.split("@")[0] || "Inbound lead";
  if (typeof value === "string") {
    const match = value.match(/^\s*"?([^"<]+)"?\s*</);
    const name = (match ? match[1] : "").trim();
    return name || email.split("@")[0] || "Inbound lead";
  }
  const name = value.value?.[0]?.name || "";
  return String(name || "").trim() || email.split("@")[0] || "Inbound lead";
}

function extractAddress(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/<([^>]+)>/);
    return (match ? match[1] : value).trim().toLowerCase();
  }
  if (value.value?.[0]?.address) return String(value.value[0].address).toLowerCase();
  if (value.text) return extractAddress(value.text);
  return "";
}

async function imapAuth(account) {
  if (account.encryptedSecret) {
    return smtpAuth(account);
  }
  const oauth = await getOAuthAuth(account);
  if (oauth) {
    const { token } = await oauth.getAccessToken();
    if (token) return { user: account.email, accessToken: token };
  }
  throw httpError("Mailbox has no IMAP credentials", 503);
}

async function leadFromThreadHeader(internetMessageId) {
  if (!internetMessageId) return null;
  const prior = await Message.findOne({
    internetMessageId,
    direction: MESSAGE_DIRECTION.OUTBOUND,
    leadId: { $ne: null },
  });
  if (!prior) return null;
  const lead = await Lead.findById(prior.leadId);
  return resolveChildOrOpen(lead);
}

async function findLeadForInbound(parsed, accountEmail) {
  const from = extractAddress(parsed.from);
  const inReplyTo = String(parsed.inReplyTo || "").trim();
  const references = [].concat(parsed.references || []).map(String);
  if (inReplyTo) {
    const lead = await leadFromThreadHeader(inReplyTo);
    if (lead) return lead;
  }
  for (const ref of references) {
    const lead = await leadFromThreadHeader(ref);
    if (lead) return lead;
  }
  if (from && from !== accountEmail) {
    const project = detectProjectFromText(parsed.subject, parsed.text);
    return (await findOpenLead(from, project)) || (await findOpenLead(from));
  }
  return null;
}

async function leadForNewInbound(parsed, account) {
  const from = extractAddress(parsed.from);
  if (!from || from === account.email) return null;
  if (isBounce(parsed, from)) {
    const bounced = await findLeadForInbound(parsed, account.email);
    if (bounced) {
      bounced.status = "invalid";
      await bounced.save();
    }
    return null;
  }
  if (await isSuppressedEmail(from)) return null;
  const lead = await findLeadForInbound(parsed, account.email);
  if (lead) return lead;
  const settings = await getRuntimeSettings();
  if (!settings.createLeadsFromInbox) return null;
  return createInboundLead({
    email: from,
    businessName: extractDisplayName(parsed.from, from),
    project: detectProjectFromText(parsed.subject, parsed.text),
    subject: parsed.subject || "",
    bodyText: parsed.text || "",
  });
}

function isBounce(parsed, from) {
  const subject = String(parsed.subject || "").toLowerCase();
  return (
    from.includes("mailer-daemon") ||
    from.includes("postmaster") ||
    subject.includes("undeliverable") ||
    subject.includes("delivery status") ||
    subject.includes("failure notice")
  );
}

async function finishInbound(lead, inbound) {
  try {
    await handleInbound(lead, inbound);
  } catch (error) {
    logger.warn({ err: error, messageId: String(inbound._id) }, "inbound handle failed");
  }
  await publishLive("mailbox", { messageId: String(inbound._id), leadId: String(lead._id), inbound: true });
  return inbound;
}

async function ingestMessage(account, parsed, uid) {
  const from = extractAddress(parsed.from);
  const messageId = String(parsed.messageId || `imap-${account._id}-${uid}`);
  const existing = await Message.findOne({ internetMessageId: messageId });
  if (existing) {
    if (existing.direction === MESSAGE_DIRECTION.INBOUND && !existing.classification && existing.leadId) {
      const lead = await Lead.findById(existing.leadId);
      if (lead) await finishInbound(lead, existing);
    }
    return existing;
  }
  const lead = await leadForNewInbound(parsed, account);
  if (!lead) return null;
  if (isBounce(parsed, from)) {
    lead.status = "invalid";
    await lead.save();
    return null;
  }
  const thread = await getOrCreateThread(lead, account, parsed.subject || "");
  const inbound = await Message.create({
    threadId: thread._id,
    leadId: lead._id,
    accountId: account._id,
    direction: MESSAGE_DIRECTION.INBOUND,
    status: MESSAGE_STATUS.DELIVERED,
    from,
    to: account.email,
    subject: parsed.subject || "",
    bodyText: parsed.text || (parsed.html ? String(parsed.html).replace(/<[^>]+>/g, " ") : ""),
    bodyHtml: parsed.html || "",
    internetMessageId: messageId,
    inReplyTo: String(parsed.inReplyTo || ""),
    references: [].concat(parsed.references || []).map(String),
    idempotencyKey: sha256(`imap:${account._id}:${uid}:${messageId}`),
  });
  return finishInbound(lead, inbound);
}

async function pollInbox() {
  const account = await getActiveMailbox();
  const auth = await imapAuth(account);
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth,
    logger: false,
    loginMethod: auth.accessToken ? "AUTH=XOAUTH2" : "LOGIN",
  });
  await client.connect();
  logger.info({ auth: auth.accessToken ? "oauth" : "app_password" }, "inbox imap connected");
  const lock = await client.getMailboxLock("INBOX");
  try {
    const query = account.lastImapUid
      ? { uid: `${account.lastImapUid + 1}:*` }
      : { seen: false };
    let maxUid = account.lastImapUid || 0;
    let ingested = 0;
    for await (const msg of client.fetch(query, { uid: true, source: true })) {
      const parsed = await simpleParser(msg.source);
      await ingestMessage(account, parsed, msg.uid);
      ingested += 1;
      if (msg.uid > maxUid) maxUid = msg.uid;
    }
    await EmailAccount.findByIdAndUpdate(account._id, { lastImapUid: maxUid, lastSyncAt: new Date() });
    logger.info({ ingested, auth: auth.accessToken ? "oauth" : "app_password" }, "inbox poll ok");
    await publishLive("mailbox", { ingested, lastSyncAt: new Date().toISOString() });
  } finally {
    lock.release();
    await client.logout();
  }
}

let authBackoffUntil = 0;

function isAuthFailure(error) {
  return Boolean(
    error?.authenticationFailed ||
      error?.serverResponseCode === "AUTHENTICATIONFAILED" ||
      String(error?.responseText || "").toLowerCase().includes("invalid credentials")
  );
}

async function safePollInbox() {
  if (Date.now() < authBackoffUntil) return;
  try {
    await pollInbox();
  } catch (error) {
    if (isAuthFailure(error)) {
      authBackoffUntil = Date.now() + 15 * 60 * 1000;
      logger.warn({ err: error }, "inbox poll auth failed, backing off for 15m");
      return;
    }
    logger.warn({ err: error }, "inbox poll failed");
  }
}

async function ingestWebhookPayload(payload = {}) {
  const account = await getActiveMailbox();
  const from = String(payload.from || "").trim().toLowerCase();
  const subject = String(payload.subject || "");
  const text = String(payload.text || payload.body || "");
  const messageId = String(payload.messageId || payload.internetMessageId || `hook-${Date.now()}`);
  const parsed = {
    from,
    subject,
    text,
    html: payload.html || "",
    messageId,
    inReplyTo: payload.inReplyTo || "",
    references: payload.references || [],
  };
  return ingestMessage(account, parsed, payload.uid || Date.now());
}

export { pollInbox, safePollInbox, ingestWebhookPayload };
