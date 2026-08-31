import { asyncHandler } from "../../utils/asyncHandler.js";
import { ok } from "../../utils/response.js";
import { getPublicSettings, saveSettings } from "./settings.service.js";
import { seedMailbox } from "../mailbox/mailbox.service.js";

const getSettingsController = asyncHandler(async (_req, res) => {
  return ok(res, await getPublicSettings());
});

const updateSettingsController = asyncHandler(async (req, res) => {
  const data = await saveSettings(req.body);
  await seedMailbox();
  return ok(res, data, 200, "Settings saved");
});

export { getSettingsController, updateSettingsController };
