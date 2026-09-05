const ROLES = Object.freeze({
  ADMIN: "admin",
  MANAGER: "manager",
  REVIEWER: "reviewer",
});

const CAMPAIGN_STATUS = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

const JOB_STATUS = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

const LEAD_STATUS = Object.freeze({
  SCRAPED: "scraped",
  ENRICHED: "enriched",
  VERIFIED: "verified",
  QUALIFIED: "qualified",
  READY_FOR_OUTREACH: "ready_for_outreach",
  CONTACTED: "contacted",
  REPLIED: "replied",
  INTERESTED: "interested",
  AI_HANDLING: "ai_handling",
  HUMAN_REVIEW_REQUIRED: "human_review_required",
  MEETING_SCHEDULED: "meeting_scheduled",
  WON: "won",
  LOST: "lost",
  NOT_INTERESTED: "not_interested",
  UNSUBSCRIBED: "unsubscribed",
  INVALID: "invalid",
  SUPPRESSED: "suppressed",
  FOLLOW_UP_EXHAUSTED: "follow_up_exhausted",
  SNOOZED: "snoozed",
  CLOSED_SWITCHED: "closed_switched",
});

const PROJECT_TYPES = Object.freeze({
  NEW_WEBSITE: "new_website",
  WEBSITE_UPGRADE: "website_upgrade",
  CUSTOM_WEB_APP: "custom_web_app",
  BOOKING_SYSTEM: "booking_system",
  ECOMMERCE: "ecommerce",
  SEO: "seo",
  SMO: "smo",
  GOOGLE_ADS: "google_ads",
  META_ADS: "meta_ads",
  IT_SERVICES: "it_services",
  OTHER: "other",
});

const LEAD_SOURCE = Object.freeze({
  SCRAPE: "scrape",
  INBOUND: "inbound",
  MANUAL: "manual",
});

const CAMPAIGN_KIND = Object.freeze({
  OUTREACH: "outreach",
  INBOUND: "inbound",
});

const TERMINAL_LEAD_STATUSES = Object.freeze([
  LEAD_STATUS.UNSUBSCRIBED,
  LEAD_STATUS.NOT_INTERESTED,
  LEAD_STATUS.SUPPRESSED,
  LEAD_STATUS.INVALID,
  LEAD_STATUS.WON,
  LEAD_STATUS.LOST,
  LEAD_STATUS.FOLLOW_UP_EXHAUSTED,
  LEAD_STATUS.CLOSED_SWITCHED,
]);

const MESSAGE_STATUS = Object.freeze({
  DRAFT: "draft",
  QUEUED: "queued",
  SENT: "sent",
  DELIVERED: "delivered",
  BOUNCED: "bounced",
  FAILED: "failed",
});

const MESSAGE_DIRECTION = Object.freeze({
  INBOUND: "inbound",
  OUTBOUND: "outbound",
});

const FOLLOWUP_STATUS = Object.freeze({
  SCHEDULED: "scheduled",
  SENT: "sent",
  CANCELLED: "cancelled",
  EXHAUSTED: "exhausted",
});

const TASK_STATUS = Object.freeze({
  OPEN: "open",
  WAITING_USER: "waiting_user",
  RESOLVED: "resolved",
  CANCELLED: "cancelled",
});

const MEETING_STATUS = Object.freeze({
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

const REPLY_CLASS = Object.freeze({
  INTERESTED: "interested",
  NOT_INTERESTED: "not_interested",
  ASKING_PRICING: "asking_pricing",
  ASKING_PORTFOLIO: "asking_portfolio",
  ASKING_DETAILS: "asking_details",
  OBJECTION: "objection",
  MEETING_REQUEST: "meeting_request",
  CLARIFICATION: "clarification",
  OUT_OF_OFFICE: "out_of_office",
  AUTOMATED: "automated",
  UNSUBSCRIBE: "unsubscribe",
  AMBIGUOUS: "ambiguous",
});

const STREAMS = Object.freeze({
  JOBS: "stream:jobs",
  EVENTS: "stream:events",
});

const JOB_TYPES = Object.freeze({
  SCRAPE: "scrape",
  ENRICH: "enrich",
  VERIFY: "verify",
});

const EVENT_TYPES = Object.freeze({
  LEAD_CREATED: "lead.created",
  LEAD_CANDIDATE: "lead.candidate",
  JOB_COMPLETED: "job.completed",
  JOB_NEEDS_BACKFILL: "job.needs_backfill",
  OUTREACH_SEND: "outreach.send",
  INBOX_POLL: "inbox.poll",
});

const CONSUMER_GROUPS = Object.freeze({
  SCRAPERS: "scrapers",
  AI: "ai",
});

const QDRANT_COLLECTIONS = Object.freeze({
  LEADS: "leads",
  KNOWLEDGE: "knowledge",
});

const EMBEDDING_SIZE = 768;

const HIGH_IMPACT_CLASSES = new Set([
  REPLY_CLASS.ASKING_PRICING,
  REPLY_CLASS.OBJECTION,
]);

export {
  ROLES,
  CAMPAIGN_STATUS,
  CAMPAIGN_KIND,
  JOB_STATUS,
  LEAD_STATUS,
  LEAD_SOURCE,
  PROJECT_TYPES,
  TERMINAL_LEAD_STATUSES,
  MESSAGE_STATUS,
  MESSAGE_DIRECTION,
  FOLLOWUP_STATUS,
  TASK_STATUS,
  MEETING_STATUS,
  REPLY_CLASS,
  STREAMS,
  JOB_TYPES,
  EVENT_TYPES,
  CONSUMER_GROUPS,
  QDRANT_COLLECTIONS,
  EMBEDDING_SIZE,
  HIGH_IMPACT_CLASSES,
};
