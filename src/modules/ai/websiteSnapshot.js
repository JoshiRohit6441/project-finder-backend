const BOOKING_RE =
  /book\s*(now|online|appointment|a visit)|request\s+(an\s+)?appointment|schedule\s+(a\s+)?(visit|appointment)|online\s+booking|patient\s+portal|\/(book|booking|appointments?|schedule)\b|calendly|zocdoc|opentable|resy|mindbody|setmore|simplybook|acuity|square\.site|booked\.in|doctorsite|modento|nexhealth|localmed|weave|solutionreach|dentrix|opendental|patientfi/;

function detectBooking(html) {
  const text = String(html || "").toLowerCase();
  return BOOKING_RE.test(text);
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
  const speedScore = scoreFromSignals({ ttfbMs, pageBytes, ssl, hasViewport });
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
      mobileFriendly: lighthouse.audits?.["viewport"]?.score === 1,
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
    if (!response.ok) {
      return analyzeHtml("", href, ttfbMs, 0);
    }
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

export { snapshotWebsite, analyzeHtml, scoreFromSignals, detectBooking };
