import Redis from "ioredis";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

let client;

function getRedis() {
  if (!client) {
    client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    client.on("error", (err) => logger.error({ err }, "redis error"));
  }
  return client;
}

async function connectRedis() {
  const redis = getRedis();
  await redis.ping();
  logger.info("redis connected");
  return redis;
}

async function acquireLock(key, ttlSeconds = 300) {
  const redis = getRedis();
  const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
}

async function releaseLock(key) {
  const redis = getRedis();
  await redis.del(key);
}

async function withLock(key, ttlSeconds, fn) {
  const locked = await acquireLock(key, ttlSeconds);
  if (!locked) return;
  try {
    return await fn();
  } finally {
    await releaseLock(key);
  }
}

export { getRedis, connectRedis, acquireLock, releaseLock, withLock };
