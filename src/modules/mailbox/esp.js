import { httpError } from "../../utils/httpError.js";
import { logger } from "../../utils/logger.js";

async function sendViaInstantly({ to, subject, text, apiKey }) {
  if (!apiKey) throw httpError("Instantly API key is not set", 503);
  const response = await fetch("https://api.instantly.ai/api/v2/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      subject,
      body: { text },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    logger.warn({ data }, "instantly send failed");
    throw httpError(data?.message || "Instantly send failed", 502);
  }
  return { messageId: data?.id || data?.email_id || `instantly:${Date.now()}`, accepted: [to], rejected: [] };
}

async function sendViaSmartlead({ to, subject, text, apiKey, campaignId }) {
  if (!apiKey) throw httpError("Smartlead API key is not set", 503);
  if (!campaignId) throw httpError("Smartlead campaign id is not set", 503);
  const response = await fetch(
    `https://server.smartlead.ai/api/v1/campaigns/${encodeURIComponent(campaignId)}/leads?api_key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_list: [{ email: to, first_name: subject || "Lead" }],
        settings: { ignore_duplicate_leads_in_other_campaign: true },
      }),
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    logger.warn({ data, subject, text: String(text).slice(0, 80) }, "smartlead send failed");
    throw httpError(data?.message || "Smartlead send failed", 502);
  }
  return { messageId: data?.id || `smartlead:${Date.now()}`, accepted: [to], rejected: [] };
}

async function sendViaEsp(settings, mail) {
  if (settings.sendingProvider === "instantly") {
    return sendViaInstantly({ ...mail, apiKey: settings.instantlyApiKey });
  }
  if (settings.sendingProvider === "smartlead") {
    return sendViaSmartlead({
      ...mail,
      apiKey: settings.smartleadApiKey,
      campaignId: settings.smartleadCampaignId,
    });
  }
  return null;
}

export { sendViaInstantly, sendViaSmartlead, sendViaEsp };
