import { connectInfra } from "./infra.js";
import { withLock } from "./db/redis.js";
import { readGroup, ack } from "./queues/streams.js";
import { STREAMS, CONSUMER_GROUPS, EVENT_TYPES } from "./constants/index.js";
import { processCandidateLead, processCreatedLead, processPendingScrapedLeads, processMissingPitches, rejectIncompleteEmailLeads } from "./modules/ai/processLead.js";
import { sendStoredMessage, processDueFollowUps } from "./modules/outreach/outreach.service.js";
import { safePollInbox } from "./modules/mailbox/inbox.service.js";
import { getRuntimeSettings } from "./modules/settings/settings.service.js";
import { logger } from "./utils/logger.js";

const CONSUMER = `ai-${process.pid}`;

const HANDLERS = {
  [EVENT_TYPES.LEAD_CANDIDATE]: (data) =>
    data?.lead?.fingerprint &&
    withLock(`lock:fingerprint:${data.lead.fingerprint}`, 180, () => processCandidateLead(data)),
  [EVENT_TYPES.LEAD_CREATED]: (data) =>
    data?.leadId && withLock(`lock:lead:${data.leadId}`, 180, () => processCreatedLead(data.leadId)),
  [EVENT_TYPES.OUTREACH_SEND]: (data) =>
    data?.messageId && withLock(`lock:message:${data.messageId}`, 180, () => sendStoredMessage(data.messageId)),
};

async function handleEvent(message) {
  const { type, data } = message.payload;
  const handler = HANDLERS[type];
  if (handler) await handler(data);
}

async function loop() {
  while (true) {
    try {
      const messages = await readGroup(STREAMS.EVENTS, CONSUMER_GROUPS.AI, CONSUMER, 5, 5000);
      for (const message of messages) {
        try {
          await handleEvent(message);
          await ack(STREAMS.EVENTS, CONSUMER_GROUPS.AI, message.id);
        } catch (error) {
          logger.error({ err: error, id: message.id }, "ai event failed");
        }
      }
    } catch (error) {
      logger.error({ err: error }, "ai worker loop error");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

function startSchedulers() {
  setInterval(() => {
    processPendingScrapedLeads().catch((error) => logger.warn({ err: error }, "scraped lead tick failed"));
  }, 90 * 1000);
  setInterval(() => {
    processMissingPitches().catch((error) => logger.warn({ err: error }, "pitch tick failed"));
  }, 45 * 1000);
  setInterval(() => {
    processDueFollowUps().catch((error) => logger.warn({ err: error }, "follow-up tick failed"));
  }, 60 * 1000);
  setInterval(() => {
    safePollInbox().catch((error) => logger.warn({ err: error }, "inbox tick failed"));
  }, 90 * 1000);
  safePollInbox().catch((error) => logger.warn({ err: error }, "inbox tick failed"));
}

async function start() {
  await connectInfra();
  await getRuntimeSettings();
  await rejectIncompleteEmailLeads();
  startSchedulers();
  processPendingScrapedLeads().catch((error) => logger.warn({ err: error }, "scraped lead tick failed"));
  processMissingPitches().catch((error) => logger.warn({ err: error }, "pitch tick failed"));
  logger.info("ai worker started");
  await loop();
}

start().catch((error) => {
  logger.error({ err: error }, "ai worker failed to start");
  process.exit(1);
});
