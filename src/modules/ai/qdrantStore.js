import { getQdrant, ensureCollection } from "../../db/qdrant.js";
import { embedText } from "./gemini.js";
import { getRuntimeSettings } from "../settings/settings.service.js";

function toPointId(mongoId) {
  const hex = String(mongoId).padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function collectionFor(settings, dim) {
  if (settings.defaultAi === "openai") {
    const size = dim || (String(settings.openaiEmbeddingModel).includes("large") ? 3072 : 1536);
    return { name: `leads_openai_${size}`, size };
  }
  return { name: "leads", size: dim || 768 };
}

async function upsertLeadVector(lead) {
  const text = [
    lead.businessName,
    lead.category,
    lead.country,
    lead.location,
    lead.address,
    lead.aiReason,
  ]
    .filter(Boolean)
    .join(" | ");
  const vector = await embedText(text);
  const settings = await getRuntimeSettings();
  const { name, size } = collectionFor(settings, vector.length);
  await ensureCollection(name, size);
  const qdrant = getQdrant();
  await qdrant.upsert(name, {
    wait: true,
    points: [
      {
        id: toPointId(lead._id),
        vector,
        payload: {
          leadId: String(lead._id),
          campaignId: String(lead.campaignId),
          businessName: lead.businessName,
          country: lead.country,
          status: lead.status,
          category: lead.category,
        },
      },
    ],
  });
}

export { upsertLeadVector };
