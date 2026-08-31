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
  const result = await sendAiReply(
    lead,
    inbound,
    { classification: inbound.classification, proposedResponse: "" },
    null,
    {
      idempotencyKey: `reply:questions:${lead._id}:${inbound._id}`,
      userNotes:
        "Ask 3 short questions so they can reply: how many pages they need, whether they already have content or a logo, and when they want the site live. Do not invent a price or portfolio. Invite them to reply to this email.",
    }
  );
  logger.info(
    {
      leadId: String(lead._id),
      replyId: result.message?._id ? String(result.message._id) : "",
      subject: result.message?.subject,
    },
    "question follow-up sent"
  );
  process.exit(0);
}

run().catch((error) => {
  logger.error({ err: error }, "question follow-up failed");
  process.exit(1);
});
