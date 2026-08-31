import { protectedRouter } from "../../middleware/protect.js";
import { ROLES } from "../../constants/index.js";
import { listController, slotsController, createController, inviteController } from "./meeting.controller.js";

const router = protectedRouter(ROLES.ADMIN, ROLES.MANAGER);

router.get("/", listController);
router.get("/slots/:leadId", slotsController);
router.post("/", createController);
router.post("/:id/invite", inviteController);

export { router as meetingRoutes };
