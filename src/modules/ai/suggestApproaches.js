import { PROJECT_TYPES } from "../../constants/index.js";
import { projectLabel } from "../leads/projects.js";

const BOOKING_CATEGORY = /clinic|dental|dentist|salon|gym|spa|restaurant|hotel|lawyer|attorney/i;

function item(service, reason, evidence) {
  return { service, label: projectLabel(service), reason, evidence };
}

function suggestApproaches(lead = {}, snapshot) {
  const name = lead.businessName || "this business";
  const category = String(lead.category || "");
  if (!lead.hasWebsite || !lead.website) {
    return [
      item(PROJECT_TYPES.NEW_WEBSITE, `${name} has no clear website. A simple professional site is the first honest pitch.`, "no website"),
      item(PROJECT_TYPES.GOOGLE_ADS, "Without a site they still need inbound calls. Search ads can send traffic to a landing page or WhatsApp.", "no website"),
      item(PROJECT_TYPES.SMO, "No owned site means they likely depend on Maps or word of mouth. Profiles and posting cadence are a real gap.", "no website / no socials on a site"),
    ];
  }

  const s = snapshot || {};
  const ranked = [];
  if (!s.ssl || !s.mobileFriendly || Number(s.speedScore) < 60) {
    ranked.push(
      item(
        PROJECT_TYPES.WEBSITE_UPGRADE,
        `The current site is weak on ${[!s.ssl && "SSL", !s.mobileFriendly && "mobile", Number(s.speedScore) < 60 && `speed (${s.speedScore || "?"})`].filter(Boolean).join(", ")}.`,
        `ssl=${Boolean(s.ssl)} mobile=${Boolean(s.mobileFriendly)} speed=${s.speedScore || 0}`
      )
    );
  }
  if (!s.hasTitle || !s.hasMetaDescription || !s.hasH1 || !s.hasCanonical || Number(s.seoScore) < 65) {
    ranked.push(
      item(
        PROJECT_TYPES.SEO,
        "On-page SEO basics are missing or thin (title, description, H1, canonical, or structured data).",
        `seoScore=${s.seoScore || 0} title=${Boolean(s.hasTitle)} description=${Boolean(s.hasMetaDescription)} h1=${Boolean(s.hasH1)}`
      )
    );
  }
  if (Number(s.socialCount || 0) < 2) {
    ranked.push(
      item(
        PROJECT_TYPES.SMO,
        "Fewer than two social profiles are linked from the site. They are hard to find on Facebook, Instagram, or LinkedIn.",
        `socials=${Object.keys(s.socials || {}).join(",") || "none"}`
      )
    );
  }
  if (!s.hasGoogleAds && !s.hasGoogleAnalytics) {
    ranked.push(
      item(
        PROJECT_TYPES.GOOGLE_ADS,
        "No Google tag or Ads conversion snippet. They cannot measure or run Search/Maps demand capture properly.",
        "no gtag / AW- / analytics"
      )
    );
  }
  if (!s.hasMetaPixel) {
    ranked.push(
      item(
        PROJECT_TYPES.META_ADS,
        "No Meta Pixel. Instagram/Facebook ads cannot retarget site visitors or measure leads.",
        "no fbq / facebook pixel"
      )
    );
  }
  if (s.hasBooking === false && BOOKING_CATEGORY.test(category)) {
    ranked.push(
      item(
        PROJECT_TYPES.BOOKING_SYSTEM,
        `${category} usually needs online booking. The site has no booking or calendar flow.`,
        "hasBooking=false"
      )
    );
  }
  if (/shop|store|product|retail/i.test(category) && s.hasBooking === false) {
    ranked.push(
      item(PROJECT_TYPES.ECOMMERCE, "Category looks product-led and the site does not show a store/checkout.", "no store signals")
    );
  }
  if (s.hasGoogleAnalytics && s.hasMetaPixel && Number(s.speedScore) < 50) {
    ranked.push(
      item(PROJECT_TYPES.IT_SERVICES, "Tags are present but the site is slow. Hosting, updates, and maintenance are a safer first IT conversation.", `speed=${s.speedScore}`)
    );
  }
  if (!ranked.length) {
    ranked.push(
      item(
        PROJECT_TYPES.WEBSITE_UPGRADE,
        "The site exists. Approach with a focused upgrade of the weakest public pages, not a rebuild story.",
        "site present, no critical gap"
      )
    );
  }
  return ranked.slice(0, 3);
}

function pitchFromApproaches(approaches, lead) {
  const primary = approaches[0] || item(PROJECT_TYPES.NEW_WEBSITE, "Start with a simple site.", "fallback");
  return {
    service: primary.service,
    label: primary.label,
    stack: primary.service === PROJECT_TYPES.CUSTOM_WEB_APP ? "Next.js + Node.js + MongoDB" : "WordPress",
    angle: primary.reason,
    talkingPoints: approaches.slice(0, 3).map((item) => `${item.label}: ${item.reason}`),
    approaches,
  };
}

export { suggestApproaches, pitchFromApproaches };
