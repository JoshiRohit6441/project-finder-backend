import { protectedRouter } from "../../middleware/protect.js";
import { ROLES } from "../../constants/index.js";
import { listLeadsController, getLeadController, approveController, statusController, flagsController, proposalController } from "./lead.controller.js";

const router = protectedRouter(ROLES.ADMIN, ROLES.MANAGER, ROLES.REVIEWER);

router.get("/", listLeadsController);
router.get("/:id", getLeadController);
router.post("/:id/approve-outreach", approveController);
router.patch("/:id/status", statusController);
router.patch("/:id/flags", flagsController);
router.post("/:id/proposal", proposalController);

export { router as leadRoutes };
