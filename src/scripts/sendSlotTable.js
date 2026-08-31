import { connectInfra } from "../infra.js";
import { Lead } from "../models/Lead.js";
import { Message } from "../models/Message.js";
import { MESSAGE_DIRECTION, MESSAGE_STATUS } from "../constants/index.js";
import { timezoneForCountry, withSlotTable } from "../utils/timezone.js";
import { getRuntimeSettings, withSenderBlock } from "../modules/settings/settings.service.js";
import { getActiveMailbox } from "../modules/mailbox/mailbox.service.js";
import { getOrCreateThread, sendStoredMessage } from "../modules/outreach/outreach.service.js";
import { sha256 } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";

const EMAIL = String(process.argv[2] || "rjuk09072003@gmail.com").toLowerCase().trim();

async function run() {
  await connectInfra();
  const lead = await Lead.findOne({ email: EMAIL }).sort({ updatedAt: -1 });
  if (!lead) throw new Error(`No lead for ${EMAIL}`);
  const lastOut = await Message.findOne({ leadId: lead._id, direction: MESSAGE_DIRECTION.OUTBOUND }).sort({ createdAt: -1 });
  if (lastOut?.bodyText && /Slot \| Time/i.test(lastOut.bodyText)) {
    logger.info({ leadId: String(lead._id) }, "slot table already sent");
    process.exit(0);
  }
  const settings = await getRuntimeSettings();
  const timezone = lead.timezone || timezoneForCountry(lead.countryCode) || "Asia/Kolkata";
  const body = withSenderBlock(
    withSlotTable("Hello,\n\nHere are the available 1-hour slots. Please reply with the slot number.\n\nThanks", timezone),
    settings
  );
  const account = await getActiveMailbox();
  const thread = await getOrCreateThread(lead, account, lastOut?.subject || `Re: ${lead.businessName}`);
  const draft = await Message.create({
    threadId: thread._id,
    leadId: lead._id,
    accountId: account._id,
    direction: MESSAGE_DIRECTION.OUTBOUND,
    status: MESSAGE_STATUS.DRAFT,
    from: account.email,
    to: lead.email,
    subject: lastOut?.subject?.startsWith("Re:") ? lastOut.subject : `Re: ${lastOut?.subject || lead.businessName}`,
    bodyText: body,
    idempotencyKey: sha256(`slots:${lead._id}:${Date.now()}`),
  });
  const sent = await sendStoredMessage(draft._id);
  logger.info({ leadId: String(lead._id), messageId: String(sent._id), status: sent.status }, "slot table sent");
  process.exit(0);
}

run().catch((error) => {
  logger.error({ err: error }, "send slot table failed");
  process.exit(1);
});
