import { getRuntimeSettings } from "../settings/settings.service.js";
import { chooseChannel, whatsappSendMode } from "../outreach/policy.js";
import { httpError } from "../../utils/httpError.js";
import { logger } from "../../utils/logger.js";

function digits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function templateNameFor(settings, kind = "intro") {
  if (kind === "followup" && settings.whatsappFollowupTemplate) return settings.whatsappFollowupTemplate;
  if (kind === "meeting" && settings.whatsappMeetingTemplate) return settings.whatsappMeetingTemplate;
  return settings.whatsappTemplateName;
}

async function sendWhatsAppTemplate({ to, bodyText, lead, templateKind = "intro" }) {
  const settings = await getRuntimeSettings();
  const name = templateNameFor(settings, templateKind);
  if (!settings.whatsappPhoneNumberId || !settings.whatsappAccessToken || !name) {
    throw httpError("WhatsApp Business API is not configured", 503);
  }
  const payload = {
    messaging_product: "whatsapp",
    to: digits(to),
    type: "template",
    template: {
      name,
      language: { code: settings.whatsappTemplateLanguage || "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: String(lead?.businessName || "there").slice(0, 60) },
            { type: "text", text: String(bodyText || "").slice(0, 200) },
          ],
        },
      ],
    },
  };
  return graphSend(settings, payload);
}

async function sendWhatsAppFreeform({ to, bodyText }) {
  const settings = await getRuntimeSettings();
  if (!settings.whatsappPhoneNumberId || !settings.whatsappAccessToken) {
    throw httpError("WhatsApp Business API is not configured", 503);
  }
  return graphSend(settings, {
    messaging_product: "whatsapp",
    to: digits(to),
    type: "text",
    text: { body: String(bodyText || "").slice(0, 4096) },
  });
}

async function graphSend(settings, payload) {
  const url = `https://graph.facebook.com/v21.0/${settings.whatsappPhoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.whatsappAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    logger.warn({ data }, "whatsapp send failed");
    throw httpError(data?.error?.message || "WhatsApp send failed", 502);
  }
  return { messageId: data?.messages?.[0]?.id || "", accepted: [payload.to], rejected: [] };
}

async function sendWhatsApp({ lead, bodyText, isFirstOutbound, templateKind = "intro" }) {
  const mode = whatsappSendMode(lead, isFirstOutbound);
  if (mode === "template") {
    return sendWhatsAppTemplate({ to: lead.phone, bodyText, lead, templateKind });
  }
  return sendWhatsAppFreeform({ to: lead.phone, bodyText });
}

function resolveChannel(lead, settings) {
  return chooseChannel(lead, settings);
}

export { sendWhatsApp, sendWhatsAppTemplate, sendWhatsAppFreeform, resolveChannel };
