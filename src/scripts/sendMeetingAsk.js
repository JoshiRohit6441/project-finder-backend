import { connectInfra } from "../infra.js";
import { Lead } from "../models/Lead.js";
import { Message } from "../models/Message.js";
import { sendAiReply } from "../modules/replies/replies.service.js";
import { logger } from "../utils/logger.js";

async function run() {
  await connectInfra();
  const lead = await Lead.findById("6a8fe0458bef1f686a10625b");
  if (!lead) throw new Error("Lead not found");
  const inbound = await Message.findOne({ leadId: lead._id, direction: "inbound" }).sort({ createdAt: -1 });
  if (!inbound) throw new Error("Inbound not found");
  const result = await sendAiReply(lead, inbound, { classification: inbound.classification }, null, {
    forceMeeting: true,
    idempotencyKey: `reply:meeting:${lead._id}:${inbound._id}`,
    userNotes:
      "Scope is complete. Do not ask more questions. Ask them to book a short meeting to lock the quote and start date.",
  });
  logger.info({ replyId: String(result.message?._id || ""), subject: result.message?.subject }, "meeting ask sent");
  process.exit(0);
}

run().catch((error) => {
  logger.error({ err: error }, "meeting ask failed");
  process.exit(1);
});
