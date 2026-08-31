import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "../config/index.js";
import { QDRANT_COLLECTIONS, EMBEDDING_SIZE } from "../constants/index.js";
import { logger } from "../utils/logger.js";

let client;

function getQdrant() {
  if (!client) {
    client = new QdrantClient({ url: config.qdrantUrl, checkCompatibility: false });
  }
  return client;
}

async function ensureCollection(name, size = EMBEDDING_SIZE) {
  const qdrant = getQdrant();
  try {
    await qdrant.getCollection(name);
    return;
  } catch {
    try {
      await qdrant.createCollection(name, {
        vectors: { size, distance: "Cosine" },
      });
    } catch (error) {
      if (error.status !== 409) throw error;
    }
  }
}

async function connectQdrant() {
  await ensureCollection(QDRANT_COLLECTIONS.LEADS);
  await ensureCollection(QDRANT_COLLECTIONS.KNOWLEDGE);
  logger.info("qdrant ready");
}

export { getQdrant, connectQdrant, ensureCollection };
