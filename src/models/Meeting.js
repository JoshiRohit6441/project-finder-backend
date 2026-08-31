import mongoose from "mongoose";
import { MEETING_STATUS } from "../constants/index.js";

const meetingSchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    title: { type: String, required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    timezone: { type: String, default: "UTC" },
    status: { type: String, enum: Object.values(MEETING_STATUS), default: MEETING_STATUS.SCHEDULED },
    notes: { type: String, default: "" },
    calendarEventId: { type: String, default: "" },
    meetLink: { type: String, default: "" },
    invitedEmails: { type: [String], default: [] },
  },
  { timestamps: true }
);

meetingSchema.index({ startAt: 1 });

const Meeting = mongoose.model("Meeting", meetingSchema, "meetings");

export { Meeting };
