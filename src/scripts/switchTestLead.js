import { connectInfra } from "../infra.js";
import { LEAD_STATUS, CAMPAIGN_STATUS, FOLLOWUP_STATUS } from "../constants/index.js";
import { User } from "../models/User.js";
import { Lead } from "../models/Lead.js";
import { Campaign } from "../models/Campaign.js";
import { FollowUp } from "../models/FollowUp.js";
import { Settings } from "../models/Settings.js";
import { createManualCampaign, addManualLead } from "../modules/campaigns/campaign.service.js";
import { prepareOutreach } from "../modules/outreach/outreach.service.js";
import { logger } from "../utils/logger.js";

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

  const old = await Lead.findOne({ email: "devsarkar025@gmail.com" });
  if (old) {
    old.status = LEAD_STATUS.LOST;
    old.suppressed = true;
    await old.save();
    await FollowUp.updateMany({ leadId: old._id, status: FOLLOWUP_STATUS.SCHEDULED }, { status: FOLLOWUP_STATUS.CANCELLED });
    await Campaign.findByIdAndUpdate(old.campaignId, { status: CAMPAIGN_STATUS.COMPLETED });
  }

  const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
  if (!admin) throw new Error("No admin user");
  const campaign = await createManualCampaign("Mail flow test 2", admin._id);
  const lead = await addManualLead(campaign._id, {
    businessName: "Rjuk",
    email: "rjuk09072003@gmail.com",
    category: "website",
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
  const result = await prepareOutreach(lead._id);
  logger.info(
    {
      closedLeadId: old ? String(old._id) : "",
      campaignId: String(campaign._id),
      leadId: String(lead._id),
      messageId: String(result.message._id),
      status: result.message.status,
      to: lead.email,
    },
    "test lead switched"
  );
  process.exit(0);
}

run().catch((error) => {
  logger.error({ err: error }, "switch test lead failed");
  process.exit(1);
});
