import mongoose from "mongoose";
import { FOLLOWUP_STATUS } from "../constants/index.js";

const followUpSchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailThread" },
    attempt: { type: Number, default: 1 },
    nextAt: { type: Date, required: true, index: true },
    timezone: { type: String, default: "UTC" },
    status: { type: String, enum: Object.values(FOLLOWUP_STATUS), default: FOLLOWUP_STATUS.SCHEDULED, index: true },
  },
  { timestamps: true }
);

const FollowUp = mongoose.model("FollowUp", followUpSchema, "followups");

export { FollowUp };
