import { getRedis } from "../db/redis.js";

const LIVE_CHANNEL = "live:events";

async function publishLive(event, data = {}) {
  const redis = getRedis();
  await redis.publish(LIVE_CHANNEL, JSON.stringify({ event, data }));
}

export { publishLive, LIVE_CHANNEL };
