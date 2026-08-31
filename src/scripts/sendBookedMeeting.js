import { connectInfra } from "../infra.js";
import { Lead } from "../models/Lead.js";
import { Meeting } from "../models/Meeting.js";
import { scheduleMeeting, sendMeetingInvite } from "../modules/meetings/meeting.service.js";
import { parseAbsoluteSlot } from "../utils/timezone.js";
import { logger } from "../utils/logger.js";

const EMAIL = String(process.argv[2] || "rjuk09072003@gmail.com").toLowerCase().trim();
const HINT = process.argv.slice(3).join(" ") || "2026-08-27 at 17:22 (Asia/Kolkata)";

async function run() {
  await connectInfra();
  const lead = await Lead.findOne({ email: EMAIL }).sort({ updatedAt: -1 });
  if (!lead) throw new Error(`No lead for ${EMAIL}`);
  let meeting = await Meeting.findOne({ leadId: lead._id, status: "scheduled" }).sort({ startAt: 1 });
  if (!meeting) {
    const chosen = parseAbsoluteSlot(HINT, lead.timezone || "Asia/Kolkata");
    if (!chosen) throw new Error("Could not parse meeting time");
    meeting = await scheduleMeeting({
      leadId: lead._id,
      startAt: chosen.startAt,
      endAt: chosen.endAt,
      notes: "Booked from confirmed email slot",
      skipEmail: true,
    });
  }
  const sent = await sendMeetingInvite(meeting._id);
  logger.info(
    {
      leadId: String(lead._id),
      meetingId: String(sent._id),
      startAt: sent.startAt,
      hasMeetLink: Boolean(sent.meetLink),
    },
    "booked meeting invite sent"
  );
  process.exit(0);
}

run().catch((error) => {
  logger.error({ err: error }, "send booked meeting failed");
  process.exit(1);
});
