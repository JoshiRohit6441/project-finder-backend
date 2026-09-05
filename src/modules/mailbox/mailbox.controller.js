import { asyncHandler } from "../../utils/asyncHandler.js";
import { ok } from "../../utils/response.js";
import { Message } from "../../models/Message.js";
import { Lead } from "../../models/Lead.js";
import { getActiveMailbox, getMailboxStatus, oauthUrl, handleOAuthCallback } from "./mailbox.service.js";
import { safePollInbox, ingestWebhookPayload } from "./inbox.service.js";
import { getRuntimeSettings } from "../settings/settings.service.js";
import { httpError } from "../../utils/httpError.js";
import { config } from "../../config/index.js";
import { paginate } from "../../utils/query.js";

async function currentMailbox() {
  try {
    return await getActiveMailbox();
  } catch {
    return null;
  }
}

const statusController = asyncHandler(async (_req, res) => {
  return ok(res, await getMailboxStatus(await currentMailbox()));
});

const oauthUrlController = asyncHandler(async (req, res) => {
  return ok(res, { url: await oauthUrl() });
});

const oauthCallbackController = asyncHandler(async (req, res) => {
  await handleOAuthCallback(req.query.code);
  return res.redirect(`${config.frontendOrigin}/mailbox?connected=1`);
});

const pollController = asyncHandler(async (_req, res) => {
  await safePollInbox();
  return ok(res, { polled: true, ...(await getMailboxStatus(await currentMailbox())) });
});

const messagesController = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const filter = req.query.leadId ? { leadId: req.query.leadId } : { leadId: { $ne: null } };
  const { items, total } = await paginate(Message, filter, { page, limit, sort: { createdAt: req.query.leadId ? 1 : -1 } });
  const leads = await Lead.find({ _id: { $in: items.map((item) => item.leadId) } })
    .select("businessName email")
    .lean();
  const map = Object.fromEntries(leads.map((item) => [String(item._id), item]));
  return ok(res, {
    items: items.map((item) => ({
      ...item,
      lead: map[String(item.leadId)] || null,
    })),
    total,
    page,
    limit,
  });
});

const inboundWebhookController = asyncHandler(async (req, res) => {
  const settings = await getRuntimeSettings();
  const secret = settings.inboxWebhookSecret;
  if (!secret) throw httpError("Inbox webhook is not configured", 503);
  const provided = req.get("x-webhook-secret") || req.query.secret || req.body?.secret;
  if (provided !== secret) throw httpError("Invalid webhook secret", 401);
  const ingested = await ingestWebhookPayload(req.body || {});
  return ok(res, { ingested: Boolean(ingested), messageId: ingested?._id || null });
});

export { statusController, oauthUrlController, oauthCallbackController, pollController, messagesController, inboundWebhookController };
