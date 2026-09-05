const QUALIFY_SCORE = 70;

const FIRST_TOUCH_STATUSES = new Set(["qualified", "ready_for_outreach"]);

const CONTINUE_STATUSES = new Set([
  "contacted",
  "replied",
  "interested",
  "ai_handling",
  "meeting_scheduled",
]);

const GDPR_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "GB",
  "UK",
  "IS",
  "LI",
  "NO",
]);

const ALWAYS_ESCALATE_CLASSES = new Set(["asking_pricing", "objection"]);

const CONTRACT_RE =
  /\b(negotiat|discount|best price|lowest price|final price|how much exactly|give me a (price|number|quote)|contract|msa|nda|statement of work|sow\b|sign (the |this )?agreement|legal terms|liability|indemnit|retainer agreement)\b/i;

function qualifyDecision(analysis = {}) {
  const score = Number(analysis.leadScore || 0);
  const spam = Number(analysis.spamProbability || 0);
  if (analysis.recommendedStatus === "invalid" || spam >= 70) {
    return { ok: false, status: "invalid", review: false, autoSend: false };
  }
  if (analysis.recommendedStatus === "qualified" && score >= QUALIFY_SCORE) {
    return { ok: true, status: "qualified", review: false, autoSend: true, leadScore: score };
  }
  return {
    ok: true,
    status: "human_review_required",
    review: true,
    autoSend: false,
    leadScore: score,
    reason: `Score ${score} is below ${QUALIFY_SCORE} — queue for human review`,
  };
}

function canFirstOutreach(lead = {}) {
  if (lead.suppressed) return { ok: false, reason: "Lead is suppressed" };
  if (Number(lead.leadScore || 0) < QUALIFY_SCORE) {
    return { ok: false, reason: `Score below ${QUALIFY_SCORE} — send is blocked until a human approves` };
  }
  if (!FIRST_TOUCH_STATUSES.has(lead.status)) {
    return { ok: false, reason: "Lead is not qualified for first outreach" };
  }
  return { ok: true };
}

function canContinueOutreach(lead = {}) {
  if (lead.suppressed) return { ok: false, reason: "Lead is suppressed" };
  if (CONTINUE_STATUSES.has(lead.status)) return { ok: true };
  return canFirstOutreach(lead);
}

function requiresConsent(countryCode) {
  return GDPR_COUNTRY_CODES.has(String(countryCode || "").toUpperCase());
}

function canColdEmail(lead = {}) {
  if (!requiresConsent(lead.countryCode)) return { ok: true };
  if (lead.source === "inbound") return { ok: true };
  if (lead.consentAt || lead.metadata?.lawfulBasis || lead.lawfulBasis) return { ok: true };
  return {
    ok: false,
    reason: "EU/UK cold email needs consent or a recorded lawful basis",
  };
}

function hasUsablePhone(phone) {
  return String(phone || "").replace(/\D/g, "").length >= 8;
}

function hasUsableEmail(email) {
  const value = String(email || "").trim();
  return value.includes("@") && !/[*#\[\]{}<>]/.test(value);
}

function chooseChannel(lead = {}, settings = {}, explicit = "") {
  const asked = String(explicit || "").toLowerCase();
  if (asked === "email" || asked === "whatsapp") return asked;
  const preferred = String(lead.preferredChannel || lead.outreachMode || "").toLowerCase();
  const emailOk = hasUsableEmail(lead.email);
  const phoneOk = hasUsablePhone(lead.phone);
  const waReady = Boolean(
    settings.whatsappPhoneNumberId && settings.whatsappAccessToken && settings.whatsappTemplateName
  );
  if (preferred === "whatsapp") {
    if (phoneOk && waReady) return "whatsapp";
    if (emailOk) return "email";
    return "none";
  }
  if (preferred === "email") {
    if (emailOk) return "email";
    if (phoneOk && waReady) return "whatsapp";
    return "none";
  }
  if (preferred === "both") {
    if (emailOk) return "email";
    if (phoneOk && waReady) return "whatsapp";
    return "none";
  }
  if (phoneOk && lead.whatsappOptIn && waReady) return "whatsapp";
  return "email";
}

function missingContact(lead = {}) {
  return !hasUsableEmail(lead.email) && !hasUsablePhone(lead.phone);
}

function whatsappSendMode(lead = {}, isFirstOutbound = true) {
  if (isFirstOutbound) return "template";
  if (lead.whatsappWindowOpen) return "freeform";
  return "template";
}

function shouldEscalate(analysis = {}, inboundText = "") {
  if (analysis.highImpact) return true;
  if (ALWAYS_ESCALATE_CLASSES.has(analysis.classification)) return true;
  if (analysis.nextAction === "human_review") return true;
  const blob = [analysis.summary, analysis.requirement, analysis.interpretation, inboundText]
    .filter(Boolean)
    .join("\n");
  return CONTRACT_RE.test(blob);
}

function followUpOffsetDays(attempt) {
  const n = Number(attempt) || 1;
  if (n <= 1) return 3;
  return 7;
}

function followUpAngle(attempt) {
  return Number(attempt) <= 1 ? "new_angle" : "breakup";
}

function followUpChannel(lead = {}, attempt = 1) {
  const preferred = String(lead.preferredChannel || lead.outreachMode || "both");
  const last = String(lead.lastOutboundChannel || "");
  const emailOk = hasUsableEmail(lead.email);
  const phoneOk = hasUsablePhone(lead.phone);
  if (preferred === "email") return emailOk ? "email" : phoneOk ? "whatsapp" : "email";
  if (preferred === "whatsapp") return phoneOk ? "whatsapp" : emailOk ? "email" : "whatsapp";
  if (Number(attempt) >= 2) {
    const other = last === "whatsapp" ? "email" : "whatsapp";
    if (other === "email" && emailOk) return "email";
    if (other === "whatsapp" && phoneOk) return "whatsapp";
  }
  if (last === "whatsapp" && phoneOk) return "whatsapp";
  if (emailOk) return "email";
  return phoneOk ? "whatsapp" : "email";
}

function warmupDailyLimit(warmupStartedAt, fullLimit = 40, now = new Date()) {
  const cap = Number(fullLimit) || 40;
  if (!warmupStartedAt) return Math.min(cap, 10);
  const started = new Date(warmupStartedAt);
  if (Number.isNaN(started.getTime())) return Math.min(cap, 10);
  const days = Math.floor((now.getTime() - started.getTime()) / 86400000) + 1;
  if (days <= 7) return Math.min(cap, 10);
  if (days <= 14) return Math.min(cap, 20);
  if (days <= 21) return Math.min(cap, 30);
  return cap;
}

function withPostalFooter(body, settings = {}, unsubscribeUrl = "") {
  const lines = [String(body || "").trim()];
  if (settings.senderPostalAddress) {
    lines.push("", settings.senderPostalAddress);
  }
  if (unsubscribeUrl) {
    lines.push("", "---", `If you prefer not to receive further emails, unsubscribe here: ${unsubscribeUrl}`);
  }
  return lines.join("\n");
}

export {
  QUALIFY_SCORE,
  GDPR_COUNTRY_CODES,
  ALWAYS_ESCALATE_CLASSES,
  qualifyDecision,
  canFirstOutreach,
  canContinueOutreach,
  requiresConsent,
  canColdEmail,
  chooseChannel,
  missingContact,
  hasUsablePhone,
  hasUsableEmail,
  whatsappSendMode,
  shouldEscalate,
  followUpOffsetDays,
  followUpAngle,
  followUpChannel,
  warmupDailyLimit,
  withPostalFooter,
};
