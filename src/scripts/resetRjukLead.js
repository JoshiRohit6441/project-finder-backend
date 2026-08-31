import { connectInfra } from "../infra.js";
import { User } from "../models/User.js";
import { Lead } from "../models/Lead.js";
import { Campaign } from "../models/Campaign.js";
import { ScrapeJob } from "../models/ScrapeJob.js";
import { Message } from "../models/Message.js";
import { EmailThread } from "../models/EmailThread.js";
import { FollowUp } from "../models/FollowUp.js";
import { Task } from "../models/Task.js";
import { Meeting } from "../models/Meeting.js";
import { Suppression } from "../models/Suppression.js";
import { Settings } from "../models/Settings.js";
import { createManualCampaign, addManualLead } from "../modules/campaigns/campaign.service.js";
import { sendOutreachNow } from "../modules/outreach/outreach.service.js";
import { logger } from "../utils/logger.js";

const EMAIL = "rjuk09072003@gmail.com";

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
  await connectInfra();
  await Settings.findByIdAndUpdate(
    "app",
    {
      $set: {
        senderName: "Rohit Joshi",
        senderProfession: "Full Stack Developer",
        senderEmail: "joshi.rohit092003@gmail.com",
        senderWhatsapp: "8279834994",
        outreachRequireApproval: false,
      },
    },
    { upsert: true }
  );
  await Suppression.deleteOne({ type: "email", value: EMAIL });
  const existing = await Lead.find({ email: EMAIL });
  for (const lead of existing) {
    await wipeLead(lead);
  }
  await Message.deleteMany({ $or: [{ from: EMAIL }, { to: EMAIL }] });

  const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
  if (!admin) throw new Error("No admin user");
  const campaign = await createManualCampaign("Mail flow test", admin._id, "new_website");
  const lead = await addManualLead(campaign._id, {
    businessName: "Rjuk",
    email: EMAIL,
    category: "website",
    project: "new_website",
    country: "India",
    countryCode: "IN",
    location: "India",
    aiReason: "Manual test lead for the mail flow.",
    pitch: {
      service: "new_website",
      label: "Website build",
      stack: "WordPress",
      angle: "Approach them with a simple professional website build.",
      talkingPoints: [
        "A clear site with services and contact",
        "Mobile-friendly pages",
        "A contact path so enquiries do not get lost",
      ],
    },
  });
  const message = await sendOutreachNow(lead._id);
  logger.info(
    {
      campaignId: String(campaign._id),
      leadId: String(lead._id),
      messageId: String(message._id),
      status: message.status,
    },
    "rjuk test reset"
  );
  process.exit(0);
}

run().catch((error) => {
  logger.error({ err: error }, "rjuk test reset failed");
  process.exit(1);
});
