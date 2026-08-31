import { getRedis } from "../db/redis.js";
import { STREAMS, CONSUMER_GROUPS } from "../constants/index.js";
import { logger } from "../utils/logger.js";

async function ensureGroup(stream, group) {
  const redis = getRedis();
  try {
    await redis.xgroup("CREATE", stream, group, "0", "MKSTREAM");
  } catch (error) {
    if (!String(error.message).includes("BUSYGROUP")) {
      throw error;
    }
  }
}

async function publish(stream, payload) {
  const redis = getRedis();
  const flat = [];
  Object.entries(payload).forEach(([key, value]) => {
    flat.push(key, typeof value === "string" ? value : JSON.stringify(value));
  });
  return redis.xadd(stream, "*", ...flat);
}

async function enqueueJob(type, data) {
  return publish(STREAMS.JOBS, { type, data });
}

async function publishEvent(type, data) {
  return publish(STREAMS.EVENTS, { type, data });
}

async function readGroup(stream, group, consumer, count = 5, blockMs = 5000) {
  const redis = getRedis();
  const result = await redis.xreadgroup("GROUP", group, consumer, "COUNT", count, "BLOCK", blockMs, "STREAMS", stream, ">");
  if (!result) return [];
  return result.flatMap(([, entries]) =>
    entries.map(([id, fields]) => {
      const payload = {};
      for (let i = 0; i < fields.length; i += 2) {
        const key = fields[i];
        const value = fields[i + 1];
        try {
          payload[key] = JSON.parse(value);
        } catch {
          payload[key] = value;
        }
      }
      return { id, payload };
    })
  );
}

async function ack(stream, group, id) {
  const redis = getRedis();
  await redis.xack(stream, group, id);
}

async function setupStreams() {
  await ensureGroup(STREAMS.JOBS, CONSUMER_GROUPS.SCRAPERS);
  await ensureGroup(STREAMS.EVENTS, CONSUMER_GROUPS.AI);
  logger.info("redis streams ready");
}

export { enqueueJob, publishEvent, readGroup, ack, setupStreams, ensureGroup };
