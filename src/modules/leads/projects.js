import { PROJECT_TYPES } from "../../constants/index.js";

const PROJECT_LABELS = {
  [PROJECT_TYPES.NEW_WEBSITE]: "New website",
  [PROJECT_TYPES.WEBSITE_UPGRADE]: "Website upgrade",
  [PROJECT_TYPES.CUSTOM_WEB_APP]: "Custom web app",
  [PROJECT_TYPES.BOOKING_SYSTEM]: "Booking system",
  [PROJECT_TYPES.ECOMMERCE]: "Ecommerce",
  [PROJECT_TYPES.SEO]: "SEO",
  [PROJECT_TYPES.SMO]: "SMO / social",
  [PROJECT_TYPES.GOOGLE_ADS]: "Google Ads",
  [PROJECT_TYPES.META_ADS]: "Meta Ads",
  [PROJECT_TYPES.IT_SERVICES]: "IT services",
  [PROJECT_TYPES.OTHER]: "Other",
};

const PROJECT_VALUES = Object.values(PROJECT_TYPES);

const DETECT_RULES = [
  { type: PROJECT_TYPES.GOOGLE_ADS, re: /\b(google ads|adwords|search ads|ppc|sem)\b/i },
  { type: PROJECT_TYPES.META_ADS, re: /\b(meta ads|facebook ads|instagram ads|fb ads)\b/i },
  { type: PROJECT_TYPES.SEO, re: /\b(seo|search ranking|google ranking|organic traffic)\b/i },
  { type: PROJECT_TYPES.SMO, re: /\b(smo|social media|instagram|facebook page|content posting)\b/i },
  { type: PROJECT_TYPES.IT_SERVICES, re: /\b(it support|it services|hosting|maintenance|cybersecurity)\b/i },
  { type: PROJECT_TYPES.ECOMMERCE, re: /\b(e-?commerce|online store|shopify|woocommerce|sell (products|online)|product catalog|online shop)\b/i },
  { type: PROJECT_TYPES.BOOKING_SYSTEM, re: /\b(booking|appointment|scheduler|reservation)\b/i },
  { type: PROJECT_TYPES.CUSTOM_WEB_APP, re: /\b(web app|dashboard|portal|saas|crm|admin panel|custom app)\b/i },
  { type: PROJECT_TYPES.WEBSITE_UPGRADE, re: /\b(redesign|revamp|upgrade (the |my |our )?site|existing (web)?site|improve (the |my |our )?(site|website))\b/i },
  { type: PROJECT_TYPES.NEW_WEBSITE, re: /\b(new website|website|web site|landing page|business site)\b/i },
];

function normalizeProject(value, fallback = PROJECT_TYPES.OTHER) {
  const key = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (PROJECT_VALUES.includes(key)) return key;
  return fallback;
}

function projectLabel(value) {
  const key = normalizeProject(value, "");
  return PROJECT_LABELS[key] || value || "Approach";
}

function detectProjectFromText(...parts) {
  const text = parts.filter(Boolean).join("\n");
  if (!text.trim()) return PROJECT_TYPES.OTHER;
  for (const rule of DETECT_RULES) {
    if (rule.re.test(text)) return rule.type;
  }
  return PROJECT_TYPES.OTHER;
}

function pitchForProject(type, businessName = "") {
  const project = normalizeProject(type, PROJECT_TYPES.NEW_WEBSITE);
  const name = businessName || "this business";
  const label = projectLabel(project);
  const pitches = {
    [PROJECT_TYPES.WEBSITE_UPGRADE]: {
      service: project,
      label,
      stack: "WordPress",
      angle: `Approach ${name} with a focused upgrade of their current site.`,
      talkingPoints: ["Improve mobile layout and service pages", "Make contact easier to find", "Keep the current site and upgrade the weak parts"],
    },
    [PROJECT_TYPES.CUSTOM_WEB_APP]: {
      service: project,
      label,
      stack: "Next.js + Node.js + MongoDB",
      angle: `Approach ${name} with a custom web app instead of a brochure site.`,
      talkingPoints: ["A login and dashboard for their workflow", "Built around the process they already use", "Room to add features later"],
    },
    [PROJECT_TYPES.BOOKING_SYSTEM]: {
      service: project,
      label,
      stack: "WordPress",
      angle: `Approach ${name} with online booking on their site.`,
      talkingPoints: ["Add online booking on the existing site", "Cut phone-tag for appointments", "Keep the current look and add a simple booking flow"],
    },
    [PROJECT_TYPES.ECOMMERCE]: {
      service: project,
      label,
      stack: "WordPress",
      angle: `Approach ${name} with an online store so they can take orders on the site.`,
      talkingPoints: ["Product pages and checkout", "Mobile-friendly catalog", "A clear path from browse to order"],
    },
    [PROJECT_TYPES.SEO]: {
      service: project,
      label,
      stack: "SEO",
      angle: `Approach ${name} with on-page and local SEO based on what is missing on the site.`,
      talkingPoints: ["Fix title, description, and headings", "Local search and Google Business profile", "Only claim issues we actually saw"],
    },
    [PROJECT_TYPES.SMO]: {
      service: project,
      label,
      stack: "Social",
      angle: `Approach ${name} with social profiles and posting because the site barely links to Instagram, Facebook, or LinkedIn.`,
      talkingPoints: ["Findable profiles", "A simple weekly posting plan", "Link socials on the site"],
    },
    [PROJECT_TYPES.GOOGLE_ADS]: {
      service: project,
      label,
      stack: "Google Ads",
      angle: `Approach ${name} with Google Search / Maps ads. No conversion tag was found on the site.`,
      talkingPoints: ["Search demand they already have", "Track calls and form fills", "Do not invent spend numbers"],
    },
    [PROJECT_TYPES.META_ADS]: {
      service: project,
      label,
      stack: "Meta Ads",
      angle: `Approach ${name} with Meta ads. The site has no Pixel, so they cannot retarget visitors.`,
      talkingPoints: ["Instagram and Facebook demand", "Install Pixel before spend", "Do not invent ROAS"],
    },
    [PROJECT_TYPES.IT_SERVICES]: {
      service: project,
      label,
      stack: "IT",
      angle: `Approach ${name} with hosting, updates, and maintenance rather than a rebuild.`,
      talkingPoints: ["Keep the site online and patched", "Speed and backups", "Small IT retainer"],
    },
    [PROJECT_TYPES.OTHER]: {
      service: project,
      label,
      stack: "Discovery",
      angle: `Understand what ${name} needs before locking a service.`,
      talkingPoints: ["Clarify the outcome they want", "Map the pages or channels", "Propose the smallest useful first version"],
    },
  };
  return (
    pitches[project] || {
      service: PROJECT_TYPES.NEW_WEBSITE,
      label: projectLabel(PROJECT_TYPES.NEW_WEBSITE),
      stack: "WordPress",
      angle: `Approach ${name} with a simple professional website.`,
      talkingPoints: ["A clear site with services and contact", "Mobile-friendly pages", "A contact path so enquiries do not get lost"],
    }
  );
}

export { PROJECT_LABELS, PROJECT_VALUES, normalizeProject, projectLabel, detectProjectFromText, pitchForProject };
