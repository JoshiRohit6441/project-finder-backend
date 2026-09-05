import { getRuntimeSettings } from "../settings/settings.service.js";
import { isCompleteEmail } from "../verification/emailVerify.js";
import { logger } from "../../utils/logger.js";

function domainFromWebsite(website) {
  try {
    const href = String(website || "").includes("://") ? website : `https://${website}`;
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function findEmail({ website, businessName }) {
  const settings = await getRuntimeSettings();
  const key = settings.hunterApiKey;
  const domain = domainFromWebsite(website);
  if (!key || !domain) return "";
  const url = new URL("https://api.hunter.io/v2/domain-search");
  url.searchParams.set("domain", domain);
  url.searchParams.set("api_key", key);
  if (businessName) url.searchParams.set("company", String(businessName).slice(0, 80));
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return "";
    const data = await response.json();
    const emails = data?.data?.emails || [];
    const best =
      emails.find((item) => item.type === "generic" && /info|hello|contact|owner|admin/i.test(item.value || "")) ||
      emails[0];
    const value = String(best?.value || "").toLowerCase();
    return isCompleteEmail(value) ? value : "";
  } catch (error) {
    logger.warn({ err: error, domain }, "hunter lookup failed");
    return "";
  }
}

export { findEmail, domainFromWebsite };
