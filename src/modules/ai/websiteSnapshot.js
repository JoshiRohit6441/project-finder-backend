const BOOKING_RE =
  /book\s*(now|online|appointment|a visit)|request\s+(an\s+)?appointment|schedule\s+(a\s+)?(visit|appointment)|online\s+booking|patient\s+portal|\/(book|booking|appointments?|schedule)\b|calendly|zocdoc|opentable|resy|mindbody|setmore|simplybook|acuity|square\.site|booked\.in|doctorsite|modento|nexhealth|localmed|weave|solutionreach|dentrix|opendental|patientfi/;

const SOCIAL_PATTERNS = {
  facebook: /https?:\/\/(?:www\.)?(?:facebook|fb)\.com\/[A-Za-z0-9_.%-]+/i,
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.%-]+/i,
  linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9_.%-]+/i,
  youtube: /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:channel|c|user|@)|youtu\.be\/)[A-Za-z0-9_.%-]+/i,
  tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.%-]+/i,
  x: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]+/i,
};

function detectBooking(html) {
  return BOOKING_RE.test(String(html || "").toLowerCase());
}

function firstMatch(html, re) {
  const match = String(html || "").match(re);
  return match ? match[0].split(/["'\s>]/)[0] : "";
}

function extractSocials(html) {
  const socials = {};
  for (const [name, re] of Object.entries(SOCIAL_PATTERNS)) {
    const href = firstMatch(html, re);
    if (href) socials[name] = href;
  }
  return socials;
}

function analyzeHtml(html, href, ttfbMs, pageBytes) {
  const text = String(html || "");
  const title = (text.match(/<title[^>]*>([^<]+)/i) || [])[1] || "";
  const description =
    (text.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) ||
      text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ||
      [])[1] || "";
  const excerpt = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(text);
  const hasResponsiveCss = /@media\s*\(\s*max-width/i.test(text);
  const ssl = String(href || "").startsWith("https://");
  const images = text.match(/<img\b[^>]*>/gi) || [];
  const imagesMissingAlt = images.filter((tag) => !/alt\s*=\s*["'][^"']+/i.test(tag)).length;
  const socials = extractSocials(text);
  const socialCount = Object.keys(socials).length;
  const hasGoogleAnalytics = /gtag\(|googletagmanager\.com|google-analytics\.com|GA_MEASUREMENT_ID/i.test(text);
  const hasGoogleAds = /gtag\/js\?id=AW-|googleadservices\.com|google_conversion/i.test(text);
  const hasMetaPixel = /connect\.facebook\.net|fbq\s*\(|facebook\.com\/tr\?id=/i.test(text);
  const hasTitle = Boolean(title.trim());
  const hasMetaDescription = Boolean(description.trim());
  const hasH1 = /<h1\b/i.test(text);
  const hasCanonical = /rel=["']canonical["']/i.test(text);
  const hasOpenGraph = /property=["']og:/i.test(text);
  const hasJsonLd = /application\/ld\+json/i.test(text);
  const hasRobotsNoindex = /name=["']robots["'][^>]+noindex|content=["'][^"']*noindex/i.test(text);
  const contactVisible = /mailto:|tel:|whatsapp|contact us|get in touch/i.test(text);
  const speedScore = scoreFromSignals({ ttfbMs, pageBytes, ssl, hasViewport });
  let seoScore = 100;
  if (!hasTitle) seoScore -= 20;
  if (!hasMetaDescription) seoScore -= 15;
  if (!hasH1) seoScore -= 10;
  if (!hasCanonical) seoScore -= 8;
  if (!hasOpenGraph) seoScore -= 8;
  if (!ssl) seoScore -= 15;
  if (!hasViewport) seoScore -= 10;
  if (hasRobotsNoindex) seoScore -= 20;
  if (imagesMissingAlt > 2) seoScore -= 8;
  seoScore = Math.max(10, Math.min(100, seoScore));
  return {
    title: title.replace(/\s+/g, " ").trim().slice(0, 160),
    description: description.replace(/\s+/g, " ").trim().slice(0, 240),
    excerpt,
    hasBooking: detectBooking(text),
    ssl,
    mobileFriendly: hasViewport || hasResponsiveCss,
    hasViewport,
    ttfbMs: Number(ttfbMs) || 0,
    pageBytes: Number(pageBytes) || text.length,
    speedScore,
    seoScore,
    hasTitle,
    hasMetaDescription,
    hasH1,
    hasCanonical,
    hasOpenGraph,
    hasJsonLd,
    hasRobotsNoindex,
    images: images.length,
    imagesMissingAlt,
    contactVisible,
    socials,
    socialCount,
    hasGoogleAnalytics,
    hasGoogleAds,
    hasMetaPixel,
  };
}

function scoreFromSignals({ ttfbMs, pageBytes, ssl, hasViewport }) {
  let score = 100;
  const ttfb = Number(ttfbMs) || 0;
  const bytes = Number(pageBytes) || 0;
  if (ttfb > 800) score -= 15;
  if (ttfb > 1800) score -= 20;
  if (ttfb > 3500) score -= 20;
  if (bytes > 800_000) score -= 10;
  if (bytes > 2_000_000) score -= 15;
  if (!ssl) score -= 20;
  if (!hasViewport) score -= 15;
  return Math.max(10, Math.min(100, score));
}

async function fetchPageSpeed(website, apiKey) {
  if (!apiKey) return null;
  const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(website)}&strategy=mobile&key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    const lighthouse = data?.lighthouseResult || {};
    const perf = Math.round(Number(lighthouse.categories?.performance?.score || 0) * 100);
    const seo = Math.round(Number(lighthouse.categories?.seo?.score || 0) * 100);
    return {
      pagespeed: perf || null,
      seoScore: seo || null,
      mobileFriendly: lighthouse.audits?.viewport?.score === 1,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function snapshotWebsite(website, options = {}) {
  const raw = String(website || "").trim();
  if (!raw) return null;
  const href = raw.startsWith("http") ? raw : `https://${raw}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const started = Date.now();
  try {
    const response = await fetch(href, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const ttfbMs = Date.now() - started;
    if (!response.ok) return analyzeHtml("", href, ttfbMs, 0);
    const html = await response.text();
    const snapshot = analyzeHtml(html, response.url || href, ttfbMs, Buffer.byteLength(html));
    if (options.pagespeedKey) {
      const psi = await fetchPageSpeed(href, options.pagespeedKey);
      if (psi) {
        if (psi.pagespeed != null) snapshot.speedScore = psi.pagespeed;
        if (psi.seoScore != null) snapshot.seoScore = psi.seoScore;
        if (psi.mobileFriendly != null) snapshot.mobileFriendly = psi.mobileFriendly;
      }
    }
    return snapshot;
  } catch {
    return analyzeHtml("", href, Date.now() - started, 0);
  } finally {
    clearTimeout(timer);
  }
}

export { snapshotWebsite, analyzeHtml, scoreFromSignals, detectBooking, extractSocials };
