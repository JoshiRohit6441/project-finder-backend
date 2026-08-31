import { connectMongo } from "./db/mongo.js";
import { connectRedis } from "./db/redis.js";
import { connectQdrant } from "./db/qdrant.js";
import { setupStreams } from "./queues/streams.js";

export async function connectInfra() {
  await connectMongo();
  await connectRedis();
  await connectQdrant();
  await setupStreams();
}
