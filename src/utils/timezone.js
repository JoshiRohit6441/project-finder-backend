import { getSettingsSnapshot } from "../modules/settings/settings.service.js";

const COUNTRY_TZ = {
  IN: "Asia/Kolkata",
  US: "America/New_York",
  GB: "Europe/London",
  CA: "America/Toronto",
  AU: "Australia/Sydney",
  AE: "Asia/Dubai",
  DE: "Europe/Berlin",
  SG: "Asia/Singapore",
  FR: "Europe/Paris",
  NL: "Europe/Amsterdam",
};

function timezoneForCountry(code) {
  return COUNTRY_TZ[String(code || "").toUpperCase()] || "UTC";
}

function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((item) => [item.type, item.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function nextBusinessTime(from, timeZone) {
  const settings = getSettingsSnapshot();
  const start = settings.followUpHoursStart;
  const end = settings.followUpHoursEnd;
  const holidays = new Set(settings.followUpHolidays);
  let cursor = new Date(from.getTime());
  for (let i = 0; i < 21; i += 1) {
    const parts = zonedParts(cursor, timeZone);
    const sunday = parts.weekday === "Sun";
    const holiday = holidays.has(parts.dateKey);
    if (sunday || holiday || parts.hour >= end) {
      cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
      continue;
    }
    if (parts.hour < start) {
      cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
      continue;
    }
    return cursor;
  }
  return cursor;
}

function weekdayName(dateKey, timeZone) {
  const noon = new Date(`${dateKey}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-IN", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(noon);
}

function formatHour(hour, minute = 0) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function addDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function weekdayForKey(dateKey, timeZone) {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(`${dateKey}T12:00:00.000Z`));
}

function wallTime(dateKey, hour, timeZone) {
  if (timeZone === "Asia/Kolkata") {
    return new Date(`${dateKey}T${String(hour).padStart(2, "0")}:00:00+05:30`);
  }
  const start = new Date(`${dateKey}T00:00:00.000Z`).getTime() - 36 * 60 * 60 * 1000;
  for (let stamp = start; stamp < start + 72 * 60 * 60 * 1000; stamp += 60 * 1000) {
    const parts = zonedParts(new Date(stamp), timeZone);
    if (parts.dateKey === dateKey && parts.hour === hour && parts.minute === 0) return new Date(stamp);
  }
  return new Date(`${dateKey}T${String(hour).padStart(2, "0")}:00:00.000Z`);
}

function suggestSlots(timeZone) {
  const zone = timeZone || "Asia/Kolkata";
  const settings = getSettingsSnapshot();
  const hoursStart = Number.isFinite(Number(settings.followUpHoursStart)) ? Number(settings.followUpHoursStart) : 9;
  const hoursEnd = Number.isFinite(Number(settings.followUpHoursEnd)) ? Number(settings.followUpHoursEnd) : 18;
  const startHour = hoursStart < hoursEnd ? hoursStart : 9;
  const endHour = hoursEnd > startHour ? hoursEnd : 18;
  const holidays = new Set(settings.followUpHolidays || []);
  const todayKey = zonedParts(new Date(), zone).dateKey;
  let dayKey = addDateKey(todayKey, 1);
  for (let i = 0; i < 8; i += 1) {
    if (weekdayForKey(dayKey, zone) !== "Sun" && !holidays.has(dayKey)) break;
    dayKey = addDateKey(dayKey, 1);
  }
  const slots = [];
  for (let hour = startHour; hour <= endHour - 1; hour += 1) {
    const startAt = wallTime(dayKey, hour, zone);
    const endAt = wallTime(dayKey, hour + 1, zone);
    slots.push({
      index: slots.length + 1,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      timezone: zone,
      dateKey: dayKey,
      label: `${formatHour(hour)} – ${formatHour(hour + 1)}`,
      dayLabel: new Intl.DateTimeFormat("en-IN", {
        timeZone: zone,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(startAt),
    });
  }
  return slots;
}

function withSlotTable(body, timeZone) {
  const text = String(body || "").trim();
  if (/Slot \| Time/i.test(text)) return text;
  const table = formatSlotTable(suggestSlots(timeZone || "Asia/Kolkata"));
  if (!table) return text;
  return `${text}\n\n${table}`;
}

function formatSlotTable(slots) {
  if (!slots.length) return "";
  const day = slots[0].dayLabel || slots[0].dateKey;
  const zone = slots[0].timezone;
  const rows = slots.map((slot) => `${String(slot.index).padStart(2, " ")}    | ${slot.label}`);
  return [
    `Available slots — ${day}`,
    `Timezone: ${zone}. Each meeting is 1 hour. Same-day slots are not offered.`,
    "",
    "Slot | Time",
    "-----|---------------------",
    ...rows,
    "",
    "Reply with the slot number (for example: Slot 2).",
  ].join("\n");
}

function parseOfferedSlots(body) {
  const text = String(body || "");
  const zone = text.match(/Timezone:\s*([A-Za-z_/\-]+)/)?.[1] || "Asia/Kolkata";
  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  const slots = [];
  const row = /(\d+)\s*\|\s*(\d{1,2}:\d{2}\s*[AP]M)\s*[–-]\s*(\d{1,2}:\d{2}\s*[AP]M)/gi;
  let match;
  while ((match = row.exec(text))) {
    slots.push({
      index: Number(match[1]),
      startLabel: match[2],
      endLabel: match[3],
      timezone: zone,
      dateKey: dateMatch?.[1] || "",
    });
  }
  return slots;
}

function parseHourLabel(label) {
  const match = String(label || "").trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return { hour, minute: Number(match[2]) };
}

function zoneOffset(timeZone) {
  if (timeZone === "Asia/Kolkata" || timeZone === "IST") return "+05:30";
  return "+00:00";
}

function parseAbsoluteSlot(text, timeZone = "Asia/Kolkata") {
  const raw = String(text || "").replace(/\r/g, "");
  const match = raw.match(/(\d{4}-\d{2}-\d{2})\s+at\s+(\d{1,2}):(\d{2})/i);
  if (!match) return null;
  const zone = raw.match(/\(([A-Za-z_/\-]+)\)/)?.[1] || timeZone;
  const hour = String(match[2]).padStart(2, "0");
  const offset = zoneOffset(zone);
  const startAt = new Date(`${match[1]}T${hour}:${match[3]}:00${offset}`);
  if (Number.isNaN(startAt.getTime())) return null;
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    timezone: zone,
    dateKey: match[1],
    label: `${formatHour(Number(match[2]), Number(match[3]))}`,
    dayLabel: match[1],
  };
}

function hour24(hour, suffix) {
  let value = Number(hour) % 12;
  if (String(suffix || "").toUpperCase() === "PM") value += 12;
  return value;
}

function slotFromHour(hour, generated, offered, timeZone) {
  const fromGenerated = (generated || []).find((slot) => {
    const start = parseHourLabel(String(slot.label || "").split(/[–-]/)[0].trim());
    return start && start.hour === hour;
  });
  if (fromGenerated) return fromGenerated;
  const dateKey = generated[0]?.dateKey || offered[0]?.dateKey;
  const zone = generated[0]?.timezone || offered[0]?.timezone || timeZone || "Asia/Kolkata";
  if (!dateKey) return null;
  const startAt = wallTime(dateKey, hour, zone);
  const endAt = wallTime(dateKey, hour + 1, zone);
  return {
    index: 0,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    timezone: zone,
    dateKey,
    label: `${formatHour(hour)} – ${formatHour(hour + 1)}`,
    dayLabel: generated[0]?.dayLabel || dateKey,
  };
}

function matchSlotFromReply(text, offered, generated) {
  const raw = String(text || "").replace(/\r/g, "");
  const visible = raw.split(/\nOn .+wrote:/)[0].split(/\n> /)[0];
  const zone = generated[0]?.timezone || offered[0]?.timezone || "Asia/Kolkata";
  const range = visible.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m)\s*(?:to|-|–|—)\s*(\d{1,2})(?::(\d{2}))?\s*([ap]m)/i);
  if (range) return slotFromHour(hour24(range[1], range[3]), generated, offered, zone);
  const clock = visible.match(/(\d{1,2}):(\d{2})\s*([ap]m)/i) || visible.match(/\b(\d{1,2})\s*([ap]m)\b/i);
  if (clock) {
    const hour = clock[3] ? hour24(clock[1], clock[3]) : hour24(clock[1], clock[2]);
    return slotFromHour(hour, generated, offered, zone);
  }
  const named = visible.match(/slot\s*#?\s*(\d+)/i);
  if (named) {
    const index = Number(named[1]);
    return generated.find((slot) => slot.index === index) || offered.find((slot) => slot.index === index) || null;
  }
  return parseAbsoluteSlot(visible, zone);
}

function buildIcs({ title, startAt, endAt, description }) {
  const stamp = (value) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Project Finder//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@projectfinder`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(startAt)}`,
    `DTEND:${stamp(endAt)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${(description || "").replace(/\n/g, "\\n")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export {
  timezoneForCountry,
  nextBusinessTime,
  suggestSlots,
  withSlotTable,
  formatSlotTable,
  parseOfferedSlots,
  matchSlotFromReply,
  parseAbsoluteSlot,
  parseHourLabel,
  buildIcs,
};
