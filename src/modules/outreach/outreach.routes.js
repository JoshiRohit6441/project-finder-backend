import { protectedRouter } from "../../middleware/protect.js";
import { ROLES } from "../../constants/index.js";
import { listThreadController, prepareController, sendController, approveController } from "./outreach.controller.js";

const router = protectedRouter(ROLES.ADMIN, ROLES.MANAGER);

router.get("/leads/:id/thread", listThreadController);
router.post("/leads/:id/prepare", prepareController);
router.post("/leads/:id/send", sendController);
router.post("/messages/:messageId/approve", approveController);

export { router as outreachRoutes };
