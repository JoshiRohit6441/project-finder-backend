import {
  qualifyDecision,
  canFirstOutreach,
  canColdEmail,
  chooseChannel,
  whatsappSendMode,
  shouldEscalate,
  followUpOffsetDays,
  followUpAngle,
  warmupDailyLimit,
  withPostalFooter,
  QUALIFY_SCORE,
} from "../modules/outreach/policy.js";
import { analyzeHtml, scoreFromSignals } from "../modules/ai/websiteSnapshot.js";
import { detectTimezone } from "../utils/timezoneDetect.js";

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

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall pipeline policy tests passed");
