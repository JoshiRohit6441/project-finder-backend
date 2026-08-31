const BOOKING_RE =
  /book\s*(now|online|appointment|a visit)|request\s+(an\s+)?appointment|schedule\s+(a\s+)?(visit|appointment)|online\s+booking|patient\s+portal|\/(book|booking|appointments?|schedule)\b|calendly|zocdoc|opentable|resy|mindbody|setmore|simplybook|acuity|square\.site|booked\.in|doctorsite|modento|nexhealth|localmed|weave|solutionreach|dentrix|opendental|patientfi/;

function detectBooking(html) {
  const text = String(html || "").toLowerCase();
  return BOOKING_RE.test(text);
}

async function snapshotWebsite(website) {
  const raw = String(website || "").trim();
  if (!raw) return null;
  const href = raw.startsWith("http") ? raw : `https://${raw}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(href, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return { hasBooking: false, title: "", description: "", excerpt: "" };
    const html = await response.text();
    const title = (html.match(/<title[^>]*>([^<]+)/i) || [])[1] || "";
    const description =
      (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ||
        [])[1] || "";
    const excerpt = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);
    return {
      title: title.replace(/\s+/g, " ").trim().slice(0, 160),
      description: description.replace(/\s+/g, " ").trim().slice(0, 240),
      excerpt,
      hasBooking: detectBooking(html),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export { snapshotWebsite };
