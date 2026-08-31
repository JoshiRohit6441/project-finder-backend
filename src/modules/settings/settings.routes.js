import { validate } from "../../middleware/validate.js";
import { protectedRouter } from "../../middleware/protect.js";
import { ROLES } from "../../constants/index.js";
import { settingsSchema } from "./settings.schema.js";
import { getSettingsController, updateSettingsController } from "./settings.controller.js";

const router = protectedRouter(ROLES.ADMIN);

router.get("/", getSettingsController);
router.put("/", validate(settingsSchema), updateSettingsController);

export { router as settingsRoutes };
