import {
  qualifyDecision,
  canFirstOutreach,
  canColdEmail,
  chooseChannel,
  missingContact,
  whatsappSendMode,
  shouldEscalate,
  followUpOffsetDays,
  followUpAngle,
  followUpChannel,
  warmupDailyLimit,
  withPostalFooter,
  QUALIFY_SCORE,
} from "../modules/outreach/policy.js";
import { analyzeHtml, scoreFromSignals, extractSocials } from "../modules/ai/websiteSnapshot.js";
import { suggestApproaches } from "../modules/ai/suggestApproaches.js";
import { detectTimezone } from "../utils/timezoneDetect.js";
import { campaignFilters } from "../modules/campaigns/campaign.filters.js";

let failed = 0;
function assert(name, cond) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL  ${name}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

assert("qualify score threshold is 70", QUALIFY_SCORE === 70);
assert(
  "score 80 qualified auto-sends",
  qualifyDecision({ recommendedStatus: "qualified", leadScore: 80 }).autoSend === true
);
assert(
  "score 55 goes to human review",
  qualifyDecision({ recommendedStatus: "qualified", leadScore: 55 }).status === "human_review_required" &&
    qualifyDecision({ recommendedStatus: "qualified", leadScore: 55 }).autoSend === false
);
assert(
  "spam is rejected",
  qualifyDecision({ recommendedStatus: "verified", spamProbability: 90 }).ok === false
);
assert(
  "first send blocked below 70",
  canFirstOutreach({ leadScore: 60, status: "qualified" }).ok === false
);
assert(
  "first send allowed when qualified",
  canFirstOutreach({ leadScore: 80, status: "qualified" }).ok === true
);
assert(
  "verified status cannot first-send",
  canFirstOutreach({ leadScore: 80, status: "verified" }).ok === false
);

assert("Germany needs consent", canColdEmail({ countryCode: "DE" }).ok === false);
assert("inbound DE is allowed", canColdEmail({ countryCode: "DE", source: "inbound" }).ok === true);
assert("US cold email allowed", canColdEmail({ countryCode: "US" }).ok === true);
assert(
  "DE with lawful basis allowed",
  canColdEmail({ countryCode: "DE", metadata: { lawfulBasis: "soft_opt_in" } }).ok === true
);

assert(
  "WA only when phone verified + opt-in + API ready",
  chooseChannel(
    { phone: "+14155552671", phoneVerified: true, whatsappOptIn: true },
    { whatsappPhoneNumberId: "1", whatsappAccessToken: "t", whatsappTemplateName: "hello" }
  ) === "whatsapp"
);
assert(
  "email default without opt-in",
  chooseChannel(
    { phone: "+14155552671", phoneVerified: true, whatsappOptIn: false },
    { whatsappPhoneNumberId: "1", whatsappAccessToken: "t", whatsappTemplateName: "hello" }
  ) === "email"
);
assert("first WA outbound is template", whatsappSendMode({}, true) === "template");
assert("WA after window can be freeform", whatsappSendMode({ whatsappWindowOpen: true }, false) === "freeform");

assert("pricing always escalates", shouldEscalate({ classification: "asking_pricing" }) === true);
assert("objection always escalates", shouldEscalate({ classification: "objection" }) === true);
assert("contract text escalates", shouldEscalate({ classification: "asking_details" }, "Can you sign an NDA and negotiate the contract?") === true);
assert("simple hello does not escalate", shouldEscalate({ classification: "interested", nextAction: "auto_reply" }, "Sounds good") === false);

assert("follow-up 1 is day 3", followUpOffsetDays(1) === 3);
assert("follow-up 2 is day 7", followUpOffsetDays(2) === 7);
assert("follow-up 1 angle is new_angle", followUpAngle(1) === "new_angle");
assert("follow-up 2 angle is breakup", followUpAngle(2) === "breakup");
assert(
  "follow-up stays on email when preferred",
  followUpChannel({ preferredChannel: "email", email: "a@b.com", phone: "+919876543210" }, 2) === "email"
);
assert(
  "follow-up stays on WhatsApp when preferred",
  followUpChannel({ preferredChannel: "whatsapp", email: "a@b.com", phone: "+919876543210" }, 2) === "whatsapp"
);
assert(
  "follow-up 2 switches channel when both",
  followUpChannel(
    { preferredChannel: "both", lastOutboundChannel: "email", email: "a@b.com", phone: "+919876543210" },
    2
  ) === "whatsapp"
);
assert(
  "follow-up falls back to phone when no email",
  followUpChannel({ preferredChannel: "email", email: "", phone: "+919876543210" }, 1) === "whatsapp"
);

assert("warmup week 1 is 10", warmupDailyLimit(new Date(), 40) === 10);
assert(
  "warmup week 4 is full",
  warmupDailyLimit(new Date(Date.now() - 25 * 86400000), 40) === 40
);
assert("unknown warmup is conservative", warmupDailyLimit(null, 40) === 10);

const footer = withPostalFooter("Hello", { senderPostalAddress: "12 Baker St, London" }, "https://x/unsub");
assert("postal address in footer", footer.includes("12 Baker St, London"));
assert("unsubscribe still in footer", footer.includes("https://x/unsub"));

assert(
  "LA address uses Pacific time",
  detectTimezone({ countryCode: "US", address: "200 Santa Monica Blvd, Los Angeles, CA 90401" }) === "America/Los_Angeles"
);
assert(
  "Texas address uses Chicago",
  detectTimezone({ countryCode: "US", location: "Austin, TX" }) === "America/Chicago"
);
assert(
  "Perth uses local AU zone",
  detectTimezone({ countryCode: "AU", location: "Perth" }) === "Australia/Perth"
);
assert(
  "date header -0800 is Pacific",
  detectTimezone({ countryCode: "US", dateHeader: "Fri, 4 Sep 2026 10:00:00 -0800" }) === "America/Los_Angeles"
);
assert(
  "India stays Kolkata",
  detectTimezone({ countryCode: "IN", location: "Pune" }) === "Asia/Kolkata"
);

const audit = analyzeHtml(
  '<html><head><title>Clinic</title><meta name="viewport" content="width=device-width"><meta name="description" content="Dental"></head><body>Book online</body></html>',
  "https://clinic.example",
  400,
  20000
);
assert("audit detects SSL", audit.ssl === true);
assert("audit detects mobile viewport", audit.mobileFriendly === true);
assert("audit detects booking", audit.hasBooking === true);
assert("audit has speed score", audit.speedScore >= 70);
assert("http loses SSL points", scoreFromSignals({ ttfbMs: 200, pageBytes: 1000, ssl: false, hasViewport: true }) < 90);

const html = `
<html><head>
<title></title>
<meta name="viewport" content="width=device-width">
<script>fbq('init','123'); gtag('config','G-X');</script>
</head><body>
<a href="https://instagram.com/clinic">ig</a>
<img src="a.jpg">
</body></html>`;
const socials = extractSocials(html);
assert("extracts instagram", Boolean(socials.instagram));
const weak = analyzeHtml(html, "http://clinic.example", 400, 10000);
assert("detects missing title as SEO fail", weak.hasTitle === false);
assert("detects no SSL", weak.ssl === false);
assert("detects meta pixel", weak.hasMetaPixel === true);
const noSite = suggestApproaches({ businessName: "Ria Dental", hasWebsite: false }, null);
assert("no site primary is new website", noSite[0].service === "new_website");
const smo = suggestApproaches(
  { businessName: "Ria Dental", hasWebsite: true, website: "https://x.com", category: "dental clinic" },
  { ssl: true, mobileFriendly: true, speedScore: 80, seoScore: 80, hasTitle: true, hasMetaDescription: true, hasH1: true, hasCanonical: true, socialCount: 0, socials: {}, hasGoogleAds: true, hasGoogleAnalytics: true, hasMetaPixel: true, hasBooking: false }
);
assert("clinic without booking gets booking or smo", smo.some((item) => item.service === "booking_system" || item.service === "smo"));
const modeFilters = campaignFilters({ minRating: 4, minReviews: 5 }, "both");
assert("campaign default is both channels", modeFilters.outreachMode === "both" && modeFilters.minRating === 4);
assert(
  "explicit whatsapp send uses whatsapp",
  chooseChannel(
    { preferredChannel: "both", phone: "+919876543210", email: "a@b.com" },
    { whatsappPhoneNumberId: "1", whatsappAccessToken: "t", whatsappTemplateName: "hello" },
    "whatsapp"
  ) === "whatsapp"
);
assert(
  "both prefers email when present",
  chooseChannel({ preferredChannel: "both", email: "a@b.com", phone: "+919876543210" }, {}) === "email"
);
assert("needs a call only when both contacts missing", missingContact({ email: "", phone: "" }) === true);
assert("phone only is enough to keep the lead", missingContact({ email: "", phone: "+919876543210" }) === false);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall pipeline policy tests passed");
