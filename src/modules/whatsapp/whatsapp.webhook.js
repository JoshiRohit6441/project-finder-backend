import { Lead } from "../../models/Lead.js";
import { Message } from "../../models/Message.js";
import { getRuntimeSettings } from "../settings/settings.service.js";
import { handleInbound } from "../replies/replies.service.js";
import { getOrCreateThread } from "../outreach/outreach.service.js";
import { MESSAGE_DIRECTION, MESSAGE_STATUS } from "../../constants/index.js";
import { publishLive } from "../../live/publish.js";
import { logger } from "../../utils/logger.js";

function phoneTail(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

async function findLeadByPhone(from) {
  const tail = phoneTail(from);
  if (tail.length < 8) return null;
  const leads = await Lead.find({ phone: { $ne: "" } })
    .select("phone businessName campaignId")
    .limit(400)
    .lean();
  const match = leads.find((item) => phoneTail(item.phone) === tail);
  return match ? Lead.findById(match._id) : null;
}

async function applyStatus(status) {
  const wamid = status.id;
  if (!wamid) return;
  const message = await Message.findOne({ internetMessageId: wamid });
  if (!message) return;
  message.providerStatus = status.status || message.providerStatus;
  if (status.status === "failed") {
    message.status = MESSAGE_STATUS.FAILED;
    message.error = status.errors?.[0]?.title || status.errors?.[0]?.message || "WhatsApp failed";
  }
  await message.save();
  await publishLive("mailbox", { messageId: String(message._id), leadId: String(message.leadId), status: message.providerStatus });
}

async function ingestInbound(value) {
  for (const status of value.statuses || []) {
    await applyStatus(status);
  }
  for (const item of value.messages || []) {
    const from = item.from;
    const text =
      item.text?.body ||
      item.button?.text ||
      item.interactive?.button_reply?.title ||
      item.interactive?.list_reply?.title ||
      (item.type && item.type !== "text" ? `[${item.type} received]` : "");
    if (!from || !text) continue;
    const lead = await findLeadByPhone(from);
    if (!lead) {
      logger.info({ from }, "whatsapp inbound with no matching lead");
      continue;
    }
    const existing = await Message.findOne({ internetMessageId: item.id }).select("_id");
    if (existing) continue;
    const thread = await getOrCreateThread(lead, null, `WhatsApp · ${lead.businessName}`);
    const inbound = await Message.create({
      threadId: thread._id,
      leadId: lead._id,
      direction: MESSAGE_DIRECTION.INBOUND,
      status: MESSAGE_STATUS.DELIVERED,
      from,
      to: "whatsapp",
      channel: "whatsapp",
      subject: "WhatsApp",
      bodyText: text,
      internetMessageId: item.id,
    });
    lead.whatsappWindowOpen = true;
    lead.whatsappOptIn = true;
    lead.whatsappOptInAt = lead.whatsappOptInAt || new Date();
    await lead.save();
    await handleInbound(lead, inbound);
    await publishLive("mailbox", { messageId: String(inbound._id), leadId: String(lead._id), inbound: true });
  }
}

function verifyChallenge(query, settings) {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  const expected = settings.whatsappVerifyToken || settings.inboxWebhookSecret;
  if (mode === "subscribe" && expected && token === expected) return String(challenge || "");
  return "";
}

async function processWebhook(body) {
  const settings = await getRuntimeSettings();
  if (!settings.whatsappPhoneNumberId && !settings.whatsappAccessToken) return { ok: true, skipped: true };
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.value) await ingestInbound(change.value);
    }
  }
  return { ok: true };
}

export { verifyChallenge, processWebhook, findLeadByPhone };
