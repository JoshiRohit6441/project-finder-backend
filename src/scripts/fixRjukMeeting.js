import { connectInfra } from "../infra.js";
import { Lead } from "../models/Lead.js";
import { Meeting } from "../models/Meeting.js";
import { MEETING_STATUS } from "../constants/index.js";
import { scheduleMeeting, sendMeetingInvite } from "../modules/meetings/meeting.service.js";
import { logger } from "../utils/logger.js";

const EMAIL = "rjuk09072003@gmail.com";

await connectInfra();
const lead = await Lead.findOne({ email: EMAIL }).sort({ updatedAt: -1 });
if (!lead) throw new Error("No lead");
const startAt = new Date("2026-08-28T15:00:00+05:30");
const endAt = new Date("2026-08-28T16:00:00+05:30");
const open = await Meeting.find({ leadId: lead._id, status: MEETING_STATUS.SCHEDULED }).sort({ createdAt: 1 });
if (open.length > 1) {
  await Meeting.updateMany(
    { _id: { $in: open.slice(1).map((item) => item._id) } },
    { $set: { status: MEETING_STATUS.CANCELLED } }
  );
}
const meeting = await scheduleMeeting({
  leadId: lead._id,
  startAt,
  endAt,
  notes: "Corrected to 3:00 PM – 4:00 PM IST",
  skipEmail: true,
});
const sent = await sendMeetingInvite(meeting._id);
logger.info(
  {
    meetingId: String(sent._id),
    startAt: sent.startAt,
    cancelled: Math.max(open.length - 1, 0),
    hasMeetLink: Boolean(sent.meetLink),
  },
  "rjuk meeting corrected"
);
process.exit(0);
