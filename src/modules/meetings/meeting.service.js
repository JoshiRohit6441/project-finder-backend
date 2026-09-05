import { Meeting } from "../../models/Meeting.js";
import { Lead } from "../../models/Lead.js";
import { Campaign } from "../../models/Campaign.js";
import { Message } from "../../models/Message.js";
import { LEAD_STATUS, MEETING_STATUS, MESSAGE_DIRECTION, MESSAGE_STATUS } from "../../constants/index.js";
import { timezoneForCountry, suggestSlots, buildIcs } from "../../utils/timezone.js";
import { detectTimezone } from "../../utils/timezoneDetect.js";
import { createCalendarEvent, sendMail, addCalendarAttendees } from "../mailbox/mailer.js";
import { cancelFollowUps, getOrCreateThread } from "../outreach/outreach.service.js";
import { getActiveMailbox } from "../mailbox/mailbox.service.js";
import { getRuntimeSettings, withSenderBlock } from "../settings/settings.service.js";
import { httpError } from "../../utils/httpError.js";
import { paginate } from "../../utils/query.js";
import { logger } from "../../utils/logger.js";
import { sha256 } from "../../utils/crypto.js";
import { publishLive } from "../../live/publish.js";

async function listMeetings({ page = 1, limit = 20, leadId }) {
  const result = await paginate(Meeting, leadId ? { leadId } : {}, { page, limit, sort: { startAt: 1 } });
  const leads = await Lead.find({ _id: { $in: result.items.map((item) => item.leadId) } })
    .select("businessName email")
    .lean();
  const map = Object.fromEntries(leads.map((item) => [String(item._id), item]));
  result.items = result.items.map((item) => ({
    ...item,
    invitedEmails: item.invitedEmails || [],
    lead: map[String(item.leadId)] || null,
  }));
  return result;
}

async function getSlots(leadId) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw httpError("Lead not found", 404);
  const timezone =
    lead.timezone ||
    detectTimezone({ countryCode: lead.countryCode, location: lead.location, address: lead.address }) ||
    timezoneForCountry(lead.countryCode);
  return { timezone, slots: suggestSlots(timezone) };
}

async function scheduleMeeting({ leadId, startAt, endAt, notes, skipEmail = false }) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw httpError("Lead not found", 404);
  const open = await Meeting.find({ leadId: lead._id, status: MEETING_STATUS.SCHEDULED }).sort({ createdAt: 1 });
  const keep = open[0];
  if (open.length > 1) {
    await Meeting.updateMany(
      { _id: { $in: open.slice(1).map((item) => item._id) } },
      { $set: { status: MEETING_STATUS.CANCELLED } }
    );
  }
  if (keep) {
    keep.startAt = startAt;
    keep.endAt = endAt;
    keep.notes = notes || keep.notes;
    keep.timezone =
      lead.timezone ||
      detectTimezone({ countryCode: lead.countryCode, location: lead.location, address: lead.address }) ||
      timezoneForCountry(lead.countryCode) ||
      keep.timezone;
    await keep.save();
    lead.status = LEAD_STATUS.MEETING_SCHEDULED;
    await lead.save();
    await cancelFollowUps(lead._id);
    if (lead.email && !skipEmail) await sendMeetingInvite(keep._id);
    return keep;
  }
  const timezone =
    lead.timezone ||
    detectTimezone({ countryCode: lead.countryCode, location: lead.location, address: lead.address }) ||
    timezoneForCountry(lead.countryCode);
  const title = `Intro call with ${lead.businessName}`;
  const calendar = await createCalendarEvent({
    title,
    startAt,
    endAt,
    timezone,
    description: notes || "",
    attendee: lead.email,
  });
  const meeting = await Meeting.create({
    leadId: lead._id,
    title,
    startAt,
    endAt,
    timezone,
    status: MEETING_STATUS.SCHEDULED,
    notes: notes || "",
    calendarEventId: calendar.eventId,
    meetLink: calendar.meetLink,
  });
  lead.status = LEAD_STATUS.MEETING_SCHEDULED;
  await lead.save();
  await cancelFollowUps(lead._id);
  await Campaign.findByIdAndUpdate(lead.campaignId, { $inc: { "stats.meetings": 1 } });
  if (lead.email && !skipEmail) {
    const ics = buildIcs({ title, startAt, endAt, description: notes || calendar.meetLink || "" });
    const extra = calendar.meetLink ? `\n\nMeeting link: ${calendar.meetLink}` : "";
    await sendMail({
      to: lead.email,
      subject: title,
      text: `Looking forward to speaking with you.${extra}`,
      ics,
    });
  }
  return meeting;
}

async function ensureMeetLink(meeting, lead) {
  if (meeting.meetLink && meeting.calendarEventId) return meeting;
  const calendar = await createCalendarEvent({
    title: meeting.title,
    startAt: meeting.startAt,
    endAt: meeting.endAt,
    timezone: meeting.timezone || lead.timezone || timezoneForCountry(lead.countryCode) || "Asia/Kolkata",
    description: meeting.notes || "",
    attendee: lead.email,
  });
  if (calendar.eventId) meeting.calendarEventId = calendar.eventId;
  if (calendar.meetLink) meeting.meetLink = calendar.meetLink;
  await meeting.save();
  if (!meeting.meetLink) {
    logger.warn({ meetingId: String(meeting._id) }, "meet link missing after calendar create");
  }
  return meeting;
}

async function sendMeetingInvite(meetingId) {
  const meeting = await Meeting.findById(meetingId);
  if (!meeting) throw httpError("Meeting not found", 404);
  const lead = await Lead.findById(meeting.leadId);
  if (!lead?.email) throw httpError("Lead email is missing", 422);
  await ensureMeetLink(meeting, lead);
  const settings = await getRuntimeSettings();
  const when = new Intl.DateTimeFormat("en-IN", {
    timeZone: meeting.timezone || "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(meeting.startAt));
  const link = meeting.meetLink ? `\n\nMeeting link: ${meeting.meetLink}` : "";
  const body = withSenderBlock(
    `Hello,\n\nYou are booked for a 1-hour call on ${when} (${meeting.timezone || "Asia/Kolkata"}).${link}\n\nI will use this time to lock the quote and start date.\n\nThanks`,
    settings
  );
  const ics = buildIcs({
    title: meeting.title,
    startAt: meeting.startAt,
    endAt: meeting.endAt,
    description: meeting.meetLink || meeting.notes || "",
  });
  await sendMail({
    to: lead.email,
    subject: meeting.title,
    text: body,
    ics,
  });
  return meeting;
}

function inviteBody(meeting, settings, toName) {
  const when = new Intl.DateTimeFormat("en-IN", {
    timeZone: meeting.timezone || "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(meeting.startAt));
  const link = meeting.meetLink ? `\n\nMeeting link: ${meeting.meetLink}` : "";
  const hello = toName ? `Hello ${toName},\n\n` : "Hello,\n\n";
  return withSenderBlock(
    `${hello}You are invited to ${meeting.title} on ${when} (${meeting.timezone || "Asia/Kolkata"}).${link}\n\nThanks`,
    settings
  );
}

async function inviteGuests(meetingId, emails) {
  const meeting = await Meeting.findById(meetingId);
  if (!meeting) throw httpError("Meeting not found", 404);
  const guests = [...new Set((emails || []).map((item) => String(item || "").trim().toLowerCase()).filter((item) => item.includes("@")))];
  if (!guests.length) throw httpError("Add at least one email", 422);
  const lead = meeting.leadId ? await Lead.findById(meeting.leadId) : null;
  if (lead) await ensureMeetLink(meeting, lead);
  const settings = await getRuntimeSettings();
  const ics = buildIcs({
    title: meeting.title,
    startAt: meeting.startAt,
    endAt: meeting.endAt,
    description: meeting.meetLink || meeting.notes || "",
  });
  for (const email of guests) {
    await sendMail({
      to: email,
      subject: meeting.title,
      text: inviteBody(meeting, settings),
      ics,
    });
  }
  if (meeting.calendarEventId) await addCalendarAttendees(meeting.calendarEventId, guests);
  meeting.invitedEmails = [...new Set([...(meeting.invitedEmails || []), ...guests])];
  await meeting.save();
  if (lead) {
    try {
      const account = await getActiveMailbox();
      const thread = await getOrCreateThread(lead, account, meeting.title);
      const note = `Invitation sent to ${guests.join(", ")}${meeting.meetLink ? `\n\nMeeting link: ${meeting.meetLink}` : ""}`;
      await Message.create({
        threadId: thread._id,
        leadId: lead._id,
        accountId: account._id,
        direction: MESSAGE_DIRECTION.OUTBOUND,
        status: MESSAGE_STATUS.SENT,
        from: account.email,
        to: guests.join(", "),
        subject: meeting.title,
        bodyText: inviteBody(meeting, settings),
        sentAt: new Date(),
        idempotencyKey: sha256(`invite:${meeting._id}:${guests.join(",")}:${Date.now()}`),
      });
      thread.lastMessageAt = new Date();
      thread.lastDirection = MESSAGE_DIRECTION.OUTBOUND;
      await thread.save();
      await publishLive("mailbox", { leadId: String(lead._id), invited: guests, note });
    } catch (error) {
      logger.warn({ err: error, meetingId: String(meeting._id) }, "invite message log failed");
    }
  }
  await publishLive("leads", { meetingId: String(meeting._id), invited: guests });
  return {
    ...meeting.toObject(),
    lead: lead ? { businessName: lead.businessName, email: lead.email } : null,
  };
}

async function completeMeeting(meetingId, notes = "") {
  const meeting = await Meeting.findById(meetingId);
  if (!meeting) throw httpError("Meeting not found", 404);
  meeting.status = MEETING_STATUS.COMPLETED;
  if (notes) meeting.notes = `${meeting.notes || ""}\n${notes}`.trim();
  await meeting.save();
  await publishLive("leads", { meetingId: String(meeting._id), completed: true });
  return meeting;
}

export { listMeetings, getSlots, scheduleMeeting, sendMeetingInvite, ensureMeetLink, inviteGuests, completeMeeting };
