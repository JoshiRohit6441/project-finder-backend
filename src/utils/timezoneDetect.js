const US_STATE_TZ = {
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix",
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DC: "America/New_York",
  DE: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  IA: "America/Chicago",
  ID: "America/Boise",
  IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  MA: "America/New_York",
  MD: "America/New_York",
  ME: "America/New_York",
  MI: "America/Detroit",
  MN: "America/Chicago",
  MO: "America/Chicago",
  MS: "America/Chicago",
  MT: "America/Denver",
  NC: "America/New_York",
  ND: "America/Chicago",
  NE: "America/Chicago",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NV: "America/Los_Angeles",
  NY: "America/New_York",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VA: "America/New_York",
  VT: "America/New_York",
  WA: "America/Los_Angeles",
  WI: "America/Chicago",
  WV: "America/New_York",
  WY: "America/Denver",
};

const CITY_TZ = [
  [/los angeles|san francisco|san diego|seattle|portland|las vegas|san jose/i, "America/Los_Angeles"],
  [/denver|boulder|salt lake|phoenix|scottsdale/i, "America/Denver"],
  [/chicago|houston|dallas|austin|minneapolis|kansas city/i, "America/Chicago"],
  [/new york|boston|miami|atlanta|philadelphia|washington|orlando/i, "America/New_York"],
  [/vancouver|victoria/i, "America/Vancouver"],
  [/calgary|edmonton/i, "America/Edmonton"],
  [/toronto|ottawa/i, "America/Toronto"],
  [/montreal|québec|quebec/i, "America/Toronto"],
  [/sydney|canberra/i, "Australia/Sydney"],
  [/melbourne/i, "Australia/Melbourne"],
  [/brisbane/i, "Australia/Brisbane"],
  [/perth/i, "Australia/Perth"],
  [/adelaide/i, "Australia/Adelaide"],
];

const COUNTRY_TZ = {
  IN: "Asia/Kolkata",
  US: "America/New_York",
  GB: "Europe/London",
  UK: "Europe/London",
  CA: "America/Toronto",
  AU: "Australia/Sydney",
  AE: "Asia/Dubai",
  DE: "Europe/Berlin",
  SG: "Asia/Singapore",
  FR: "Europe/Paris",
  NL: "Europe/Amsterdam",
};

const OFFSET_TZ = {
  "-10": "Pacific/Honolulu",
  "-9": "America/Anchorage",
  "-8": "America/Los_Angeles",
  "-7": "America/Denver",
  "-6": "America/Chicago",
  "-5": "America/New_York",
  "-4": "America/Halifax",
  "0": "UTC",
  "+0": "UTC",
  "+1": "Europe/Berlin",
  "+5:30": "Asia/Kolkata",
  "+8": "Australia/Perth",
  "+10": "Australia/Sydney",
  "+11": "Australia/Sydney",
};

function cityTimezone(text) {
  const raw = String(text || "");
  for (const [re, zone] of CITY_TZ) {
    if (re.test(raw)) return zone;
  }
  return "";
}

function usStateTimezone(text) {
  const raw = String(text || "");
  const named = raw.match(/\b(California|New York|Texas|Florida|Washington|Illinois|Massachusetts|Colorado|Arizona|Oregon|Nevada|Georgia|Pennsylvania|Ohio)\b/i);
  const map = {
    california: "CA",
    "new york": "NY",
    texas: "TX",
    florida: "FL",
    washington: "WA",
    illinois: "IL",
    massachusetts: "MA",
    colorado: "CO",
    arizona: "AZ",
    oregon: "OR",
    nevada: "NV",
    georgia: "GA",
    pennsylvania: "PA",
    ohio: "OH",
  };
  if (named) {
    const code = map[named[1].toLowerCase()];
    if (code && US_STATE_TZ[code]) return US_STATE_TZ[code];
  }
  const abbr = raw.match(/,\s*([A-Z]{2})(?:\s+\d{5}|$|,)/);
  if (abbr && US_STATE_TZ[abbr[1]]) return US_STATE_TZ[abbr[1]];
  return "";
}

function timezoneFromDateHeader(header) {
  const raw = String(header || "");
  const named = raw.match(/\b([A-Za-z]+\/[A-Za-z_]+)\b/);
  if (named) return named[1];
  const offset = raw.match(/([+-])(\d{2}):?(\d{2})/);
  if (!offset) return "";
  const key = offset[3] === "30" ? `${offset[1]}${Number(offset[2])}:30` : `${offset[1]}${Number(offset[2])}`;
  return OFFSET_TZ[key] || "";
}

function detectTimezone({ countryCode, location, address, text, dateHeader } = {}) {
  const blob = [location, address, text].filter(Boolean).join(" ");
  const fromCity = cityTimezone(blob);
  if (fromCity) return fromCity;
  const fromState = usStateTimezone(blob);
  if (fromState) return fromState;
  const fromHeader = timezoneFromDateHeader(dateHeader);
  if (fromHeader) return fromHeader;
  return COUNTRY_TZ[String(countryCode || "").toUpperCase()] || "UTC";
}

export { detectTimezone, cityTimezone, usStateTimezone, timezoneFromDateHeader, US_STATE_TZ };
