import mongoose from "mongoose";
import { JOB_STATUS } from "../constants/index.js";

const scrapeJobSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
    country: { type: String, required: true },
    countryCode: { type: String, required: true, uppercase: true },
    location: { type: String, default: "" },
    targetCount: { type: Number, required: true, min: 1 },
    maxScrapeLimit: { type: Number, required: true, min: 1 },
    categories: { type: [String], default: [] },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: Object.values(JOB_STATUS), default: JOB_STATUS.QUEUED, index: true },
    discoveredCount: { type: Number, default: 0 },
    qualifiedCount: { type: Number, default: 0 },
    rejectedCount: { type: Number, default: 0 },
    duplicateCount: { type: Number, default: 0 },
    emailsFound: { type: Number, default: 0 },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    queryIndex: { type: Number, default: 0 },
    pageToken: { type: String, default: "" },
    error: { type: String, default: "" },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

scrapeJobSchema.index({ campaignId: 1, countryCode: 1 });
scrapeJobSchema.index({ status: 1, createdAt: -1 });

const ScrapeJob = mongoose.model("ScrapeJob", scrapeJobSchema, "scrapejobs");

export { ScrapeJob };
