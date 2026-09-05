import mongoose from "mongoose";
import { CAMPAIGN_STATUS, CAMPAIGN_KIND, PROJECT_TYPES, OUTREACH_MODES } from "../constants/index.js";

const countryQuotaSchema = new mongoose.Schema(
  {
    country: { type: String, required: true, trim: true },
    countryCode: { type: String, required: true, uppercase: true, trim: true },
    targetCount: { type: Number, required: true, min: 1 },
    location: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: Object.values(CAMPAIGN_KIND), default: CAMPAIGN_KIND.OUTREACH },
    project: { type: String, enum: Object.values(PROJECT_TYPES), default: PROJECT_TYPES.NEW_WEBSITE },
    status: { type: String, enum: Object.values(CAMPAIGN_STATUS), default: CAMPAIGN_STATUS.ACTIVE },
    countries: { type: [countryQuotaSchema], required: true },
    categories: { type: [String], default: [] },
    outreachMode: { type: String, enum: Object.values(OUTREACH_MODES), default: OUTREACH_MODES.EMAIL },
    filters: {
      minRating: { type: Number, default: 0, min: 0, max: 5 },
      minReviews: { type: Number, default: 0, min: 0 },
    },
    maxScrapeLimit: { type: Number, default: 200, min: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    stats: {
      discovered: { type: Number, default: 0 },
      verified: { type: Number, default: 0 },
      qualified: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
      emailsFound: { type: Number, default: 0 },
      emailsVerified: { type: Number, default: 0 },
      outreachSent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      bounced: { type: Number, default: 0 },
      replies: { type: Number, default: 0 },
      positiveReplies: { type: Number, default: 0 },
      aiHandled: { type: Number, default: 0 },
      humanReview: { type: Number, default: 0 },
      meetings: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      needsContact: { type: Number, default: 0 },
      emailsSent: { type: Number, default: 0 },
      whatsappSent: { type: Number, default: 0 },
      failedSends: { type: Number, default: 0 },
      called: { type: Number, default: 0 },
      rejectReasons: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
  },
  { timestamps: true }
);

campaignSchema.index({ createdBy: 1, createdAt: -1 });
campaignSchema.index({ status: 1 });

const Campaign = mongoose.model("Campaign", campaignSchema, "campaigns");

export { Campaign };
