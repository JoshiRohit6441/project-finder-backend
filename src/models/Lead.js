import mongoose from "mongoose";
import { LEAD_STATUS, LEAD_SOURCE, PROJECT_TYPES } from "../constants/index.js";

const leadSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "ScrapeJob", required: true, index: true },
    businessName: { type: String, required: true, trim: true },
    category: { type: String, default: "" },
    country: { type: String, default: "" },
    countryCode: { type: String, default: "", uppercase: true },
    location: { type: String, default: "" },
    address: { type: String, default: "" },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    hasWebsite: { type: Boolean, default: false },
    website: { type: String, default: "" },
    email: { type: String, default: "", lowercase: true, trim: true },
    phone: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    sourcePlaceId: { type: String, default: "" },
    socials: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    fingerprint: { type: String, required: true },
    project: { type: String, enum: Object.values(PROJECT_TYPES), default: PROJECT_TYPES.NEW_WEBSITE, index: true },
    source: { type: String, enum: Object.values(LEAD_SOURCE), default: LEAD_SOURCE.SCRAPE, index: true },
    parentLeadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", default: null, index: true },
    closedReason: { type: String, default: "" },
    status: { type: String, enum: Object.values(LEAD_STATUS), default: LEAD_STATUS.SCRAPED, index: true },
    leadScore: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
    aiReason: { type: String, default: "" },
    aiAnalysis: { type: mongoose.Schema.Types.Mixed, default: {} },
    pitch: {
      service: { type: String, default: "" },
      label: { type: String, default: "" },
      stack: { type: String, default: "" },
      angle: { type: String, default: "" },
      talkingPoints: { type: [String], default: [] },
    },
    emailVerification: {
      syntax: { type: Boolean, default: false },
      domain: { type: Boolean, default: false },
      mx: { type: Boolean, default: false },
      risk: { type: String, default: "unknown" },
      valid: { type: Boolean, default: false },
      checkedAt: { type: Date },
    },
    suppressed: { type: Boolean, default: false },
    timezone: { type: String, default: "" },
    followUpCount: { type: Number, default: 0 },
    lastContactedAt: { type: Date },
    firstContactedAt: { type: Date },
    phoneVerified: { type: Boolean, default: false },
    whatsappOptIn: { type: Boolean, default: false },
    whatsappOptInAt: { type: Date },
    whatsappWindowOpen: { type: Boolean, default: false },
    preferredChannel: { type: String, default: "" },
    consentAt: { type: Date },
    lawfulBasis: { type: String, default: "" },
    proposalSentAt: { type: Date },
    websiteAudit: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

leadSchema.index({ fingerprint: 1 }, { unique: true });
leadSchema.index({ campaignId: 1, status: 1 });
leadSchema.index({ email: 1 });
leadSchema.index({ email: 1, project: 1, status: 1 });
leadSchema.index({ sourcePlaceId: 1 });

const Lead = mongoose.model("Lead", leadSchema, "leads");

export { Lead };
