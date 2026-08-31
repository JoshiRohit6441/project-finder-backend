import { protectedRouter } from "../../middleware/protect.js";
import { ROLES } from "../../constants/index.js";
import { listLeadsController, getLeadController } from "./lead.controller.js";

const router = protectedRouter(ROLES.ADMIN, ROLES.MANAGER, ROLES.REVIEWER);

router.get("/", listLeadsController);
router.get("/:id", getLeadController);

export { router as leadRoutes };
