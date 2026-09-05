import { z } from "zod";
import { CAMPAIGN_STATUS, PROJECT_TYPES } from "../../constants/index.js";

const countryQuotaSchema = z.object({
  country: z.string().min(2),
  countryCode: z.string().min(2).max(3),
  targetCount: z.number().int().min(1).max(500),
  location: z.string().optional().default(""),
  state: z.string().optional().default(""),
  city: z.string().optional().default(""),
});

const createCampaignSchema = z.object({
  name: z.string().min(2).max(120),
  project: z
    .enum([
      "new_website",
      "website_upgrade",
      "custom_web_app",
      "booking_system",
      "ecommerce",
      "seo",
      "smo",
      "google_ads",
      "meta_ads",
      "it_services",
      "other",
    ])
    .optional()
    .default(PROJECT_TYPES.OTHER),
  countries: z.array(countryQuotaSchema).min(1),
  categories: z.array(z.string().min(2)).min(1),
  outreachMode: z.enum(["email", "whatsapp"]).optional().default("email"),
  filters: z
    .object({
      minRating: z.number().min(0).max(5).optional().default(0),
      minReviews: z.number().int().min(0).optional().default(0),
    })
    .optional()
    .default({}),
  maxScrapeLimit: z.number().int().min(1).max(5000).optional().default(200),
});

const updateCampaignStatusSchema = z.object({
  status: z.enum([
    CAMPAIGN_STATUS.ACTIVE,
    CAMPAIGN_STATUS.PAUSED,
    CAMPAIGN_STATUS.CANCELLED,
  ]),
});

export { createCampaignSchema, updateCampaignStatusSchema };
