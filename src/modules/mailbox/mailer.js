import nodemailer from "nodemailer";
import { google } from "googleapis";
import { getActiveMailbox, smtpAuth, getOAuthAuth } from "./mailbox.service.js";
import { getRedis } from "../../db/redis.js";
import { getRuntimeSettings } from "../settings/settings.service.js";
import { httpError } from "../../utils/httpError.js";
import { logger } from "../../utils/logger.js";

async function checkQuota(account) {
  const redis = getRedis();
  const now = new Date();
  const hourKey = `quota:hour:${account._id}:${now.toISOString().slice(0, 13)}`;
  const dayKey = `quota:day:${account._id}:${now.toISOString().slice(0, 10)}`;
  const [hour, day] = await Promise.all([redis.incr(hourKey), redis.incr(dayKey)]);
  if (hour === 1) await redis.expire(hourKey, 3600);
  if (day === 1) await redis.expire(dayKey, 86400);
  if (hour > account.hourlyLimit || day > account.dailyLimit) {
    await Promise.all([redis.decr(hourKey), redis.decr(dayKey)]);
    throw httpError("Sending quota reached", 429);
  }
}

async function sendMail({ to, subject, text, inReplyTo, references, unsubscribeUrl, ics }) {
  const account = await getActiveMailbox();
  await checkQuota(account);
  const from = `"${account.fromName}" <${account.email}>`;
  const headers = {};
  if (inReplyTo) headers["In-Reply-To"] = inReplyTo;
  if (references?.length) headers.References = references.join(" ");
  if (unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  const mail = {
    from,
    to,
    subject,
    text,
    headers,
    attachments: ics
      ? [{ filename: "meeting.ics", content: ics, contentType: "text/calendar; charset=utf-8; method=REQUEST" }]
      : undefined,
  };

  const oauth = (await getOAuthAuth(account)) || null;
  let transporter;
  if (oauth) {
    const settings = await getRuntimeSettings();
    const { token } = await oauth.getAccessToken();
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: account.email,
        accessToken: token,
        clientId: settings.oauthClientId,
        clientSecret: settings.oauthClientSecret,
        refreshToken: oauth.credentials.refresh_token,
      },
    });
  } else {
    transporter = nodemailer.createTransport({ service: "gmail", auth: smtpAuth(account) });
  }
  const result = await transporter.sendMail(mail);
  return { account, messageId: result.messageId, accepted: result.accepted, rejected: result.rejected };
}

async function createCalendarEvent({ title, startAt, endAt, timezone, description, attendee }) {
  const account = await getActiveMailbox();
  const auth = await getOAuthAuth(account);
  if (!auth) return { eventId: "", meetLink: "" };
  try {
    const calendar = google.calendar({ version: "v3", auth });
    const event = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: {
        summary: title,
        description,
        start: { dateTime: new Date(startAt).toISOString(), timeZone: timezone },
        end: { dateTime: new Date(endAt).toISOString(), timeZone: timezone },
        attendees: attendee ? [{ email: attendee }] : [],
        guestsCanModify: false,
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });
    const created = event.data || {};
    const entry = created.conferenceData?.entryPoints?.find((item) => item.entryPointType === "video") || created.conferenceData?.entryPoints?.[0];
    return { eventId: created.id || "", meetLink: created.hangoutLink || entry?.uri || "" };
  } catch (error) {
    logger.warn({ err: error }, "google calendar event create failed");
    return { eventId: "", meetLink: "" };
  }
}

async function addCalendarAttendees(eventId, emails) {
  const guests = [...new Set((emails || []).map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
  if (!eventId || !guests.length) return;
  const account = await getActiveMailbox();
  const auth = await getOAuthAuth(account);
  if (!auth) return;
  try {
    const calendar = google.calendar({ version: "v3", auth });
    const current = await calendar.events.get({ calendarId: "primary", eventId });
    const existing = (current.data.attendees || []).map((item) => item.email?.toLowerCase()).filter(Boolean);
    const attendees = [
      ...(current.data.attendees || []),
      ...guests.filter((email) => !existing.includes(email)).map((email) => ({ email })),
    ];
    await calendar.events.patch({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
      requestBody: { attendees },
    });
  } catch (error) {
    logger.warn({ err: error }, "google calendar attendee update failed");
  }
}

export { sendMail, createCalendarEvent, addCalendarAttendees };
