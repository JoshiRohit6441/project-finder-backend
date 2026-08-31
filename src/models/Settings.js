import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "app" },
    defaultAi: { type: String, enum: ["gemini", "openai"], default: "gemini" },
    geminiApiKey: { type: String, default: "" },
    geminiModel: { type: String, default: "gemini-3.6-flash" },
    geminiEmbeddingModel: { type: String, default: "text-embedding-004" },
    openaiApiKey: { type: String, default: "" },
    openaiModel: { type: String, default: "gpt-4o-mini" },
    openaiEmbeddingModel: { type: String, default: "text-embedding-3-small" },
    googlePlacesApiKey: { type: String, default: "" },
    gmailUser: { type: String, default: "" },
    gmailAppPassword: { type: String, default: "" },
    gmailFromName: { type: String, default: "Project Finder" },
    oauthClientId: { type: String, default: "" },
    oauthClientSecret: { type: String, default: "" },
    senderName: { type: String, default: "" },
    senderProfession: { type: String, default: "" },
    senderEmail: { type: String, default: "" },
    senderWhatsapp: { type: String, default: "" },
    outreachRequireApproval: { type: Boolean, default: true },
    createLeadsFromInbox: { type: Boolean, default: false },
    outreachDailyLimit: { type: Number, default: 40 },
    outreachHourlyLimit: { type: Number, default: 8 },
    salesContext: { type: String, default: "" },
    followUpMaxAttempts: { type: Number, default: 3 },
    followUpIntervalDays: { type: Number, default: 3 },
    followUpHoursStart: { type: Number, default: 9 },
    followUpHoursEnd: { type: Number, default: 18 },
    followUpHolidays: { type: String, default: "" },
  },
  { timestamps: true }
);

const Settings = mongoose.model("Settings", settingsSchema, "appsettings");

export { Settings };
