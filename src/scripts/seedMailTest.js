import { connectInfra } from "../infra.js";
import { User } from "../models/User.js";
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
  const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
  if (!admin) throw new Error("No admin user");
  const campaign = await createManualCampaign("Mail flow test", admin._id);
  const lead = await addManualLead(campaign._id, {
    businessName: "Dev Sarkar",
    email: "devsarkar025@gmail.com",
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
      campaignId: String(campaign._id),
      leadId: String(lead._id),
      messageId: String(result.message._id),
      status: result.message.status,
    },
    "mail test seeded"
  );
  process.exit(0);
}

run().catch((error) => {
  logger.error({ err: error }, "mail test seed failed");
  process.exit(1);
});
