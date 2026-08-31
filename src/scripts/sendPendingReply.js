import { connectInfra } from "../infra.js";
import { Lead } from "../models/Lead.js";
import { Message } from "../models/Message.js";
import { sendAiReply } from "../modules/replies/replies.service.js";
import { logger } from "../utils/logger.js";

async function run() {
  await connectInfra();
  const lead = await Lead.findOne({ email: "devsarkar025@gmail.com" });
  if (!lead) throw new Error("Test lead not found");
  const inbound = await Message.findOne({ leadId: lead._id, direction: "inbound" }).sort({ createdAt: -1 });
  if (!inbound) throw new Error("Inbound reply not found");
  const already = await Message.findOne({
    leadId: lead._id,
    direction: "outbound",
    createdAt: { $gt: inbound.createdAt },
    status: { $in: ["sent", "draft", "queued"] },
  });
  if (already) {
    logger.info({ messageId: String(already._id), status: already.status }, "reply already exists");
    process.exit(0);
  }
  const result = await sendAiReply(lead, inbound, {
    classification: inbound.classification,
    proposedResponse: "",
  });
  logger.info(
    {
      leadId: String(lead._id),
      action: result.action,
      replyId: result.message?._id ? String(result.message._id) : "",
      status: result.message?.status,
    },
    "pending reply sent"
  );
  process.exit(0);
}

run().catch((error) => {
  logger.error({ err: error }, "pending reply failed");
  process.exit(1);
});
