import mongoose from "mongoose";

const emailAccountSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    fromName: { type: String, default: "Project Finder" },
    authType: { type: String, enum: ["app_password", "oauth"], default: "app_password" },
    encryptedSecret: { type: String, default: "" },
    encryptedRefreshToken: { type: String, default: "" },
    encryptedAccessToken: { type: String, default: "" },
    tokenExpiry: { type: Date },
    dailyLimit: { type: Number, default: 40 },
    hourlyLimit: { type: Number, default: 8 },
    lastImapUid: { type: Number, default: 0 },
    lastSyncAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const EmailAccount = mongoose.model("EmailAccount", emailAccountSchema, "emailaccounts");

export { EmailAccount };
