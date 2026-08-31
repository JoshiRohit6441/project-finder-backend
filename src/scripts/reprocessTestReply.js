import { connectInfra } from "../infra.js";
import { LEAD_STATUS } from "../constants/index.js";
import { Lead } from "../models/Lead.js";
import { Message } from "../models/Message.js";
import { Suppression } from "../models/Suppression.js";
import { handleInbound } from "../modules/replies/replies.service.js";
import { logger } from "../utils/logger.js";

async function run() {
  await connectInfra();
  const email = "devsarkar025@gmail.com";
  await Suppression.deleteOne({ type: "email", value: email });
  const lead = await Lead.findOne({ email });
  if (!lead) throw new Error("Test lead not found");
  lead.suppressed = false;
  if (lead.status === LEAD_STATUS.UNSUBSCRIBED) lead.status = LEAD_STATUS.CONTACTED;
  await lead.save();
  const inbound = await Message.findOne({ leadId: lead._id, direction: "inbound" }).sort({ createdAt: -1 });
  if (!inbound) throw new Error("Inbound reply not found");
  inbound.classification = "";
  inbound.confidence = 0;
  await inbound.save();
  const result = await handleInbound(lead, inbound);
  logger.info(
    {
      leadId: String(lead._id),
      messageId: String(inbound._id),
      action: result.action,
      classification: result.analysis?.classification,
      leadStatus: lead.status,
    },
    "test reply reprocessed"
  );
  process.exit(0);
}

run().catch((error) => {
  logger.error({ err: error }, "test reply reprocess failed");
  process.exit(1);
});
