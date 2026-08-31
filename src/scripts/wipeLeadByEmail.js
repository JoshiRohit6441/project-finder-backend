import { connectInfra } from "../infra.js";
import { Lead } from "../models/Lead.js";
import { Campaign } from "../models/Campaign.js";
import { ScrapeJob } from "../models/ScrapeJob.js";
import { Message } from "../models/Message.js";
import { EmailThread } from "../models/EmailThread.js";
import { FollowUp } from "../models/FollowUp.js";
import { Task } from "../models/Task.js";
import { Meeting } from "../models/Meeting.js";
import { Settings } from "../models/Settings.js";
import { logger } from "../utils/logger.js";

const EMAIL = String(process.argv[2] || "").toLowerCase().trim();

async function wipeLead(lead) {
  const leadId = lead._id;
  const campaignId = lead.campaignId;
  await Promise.all([
    Message.deleteMany({ leadId }),
    EmailThread.deleteMany({ leadId }),
    FollowUp.deleteMany({ leadId }),
    Task.deleteMany({ leadId }),
    Meeting.deleteMany({ leadId }),
  ]);
  await Lead.deleteOne({ _id: leadId });
  const leftover = await Lead.countDocuments({ campaignId });
  if (!leftover) {
    await ScrapeJob.deleteMany({ campaignId });
    await Campaign.deleteOne({ _id: campaignId });
  }
}

async function run() {
  if (!EMAIL || !EMAIL.includes("@")) throw new Error("Pass an email to wipe");
  await connectInfra();
  await Settings.findByIdAndUpdate("app", { $set: { createLeadsFromInbox: false } });
  const existing = await Lead.find({ email: EMAIL });
  for (const lead of existing) {
    await wipeLead(lead);
  }
  await Message.deleteMany({ $or: [{ from: EMAIL }, { to: EMAIL }] });
  logger.info({ email: EMAIL, wiped: existing.length }, "lead wiped by email");
  process.exit(0);
}

run().catch((error) => {
  logger.error({ err: error }, "wipe lead by email failed");
  process.exit(1);
});
