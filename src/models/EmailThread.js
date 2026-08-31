import mongoose from "mongoose";

const emailThreadSchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, unique: true, index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailAccount" },
    subject: { type: String, default: "" },
    lastMessageAt: { type: Date },
    lastDirection: { type: String, default: "" },
    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const EmailThread = mongoose.model("EmailThread", emailThreadSchema, "emailthreads");

export { EmailThread };
