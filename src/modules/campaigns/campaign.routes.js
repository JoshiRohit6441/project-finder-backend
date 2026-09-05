import { validate } from "../../middleware/validate.js";
import { protectedRouter } from "../../middleware/protect.js";
import { ROLES } from "../../constants/index.js";
import { createCampaignSchema, updateCampaignStatusSchema } from "./campaign.schema.js";
import {
  createCampaignController,
  listCampaignsController,
  getCampaignController,
  updateCampaignStatusController,
  cloneCampaignController,
  rerunCampaignController,
} from "./campaign.controller.js";

const router = protectedRouter(ROLES.ADMIN, ROLES.MANAGER);

router.get("/", listCampaignsController);
router.post("/", validate(createCampaignSchema), createCampaignController);
router.get("/:id", getCampaignController);
router.patch("/:id/status", validate(updateCampaignStatusSchema), updateCampaignStatusController);
router.post("/:id/clone", cloneCampaignController);
router.post("/:id/rerun", rerunCampaignController);

export { router as campaignRoutes };
