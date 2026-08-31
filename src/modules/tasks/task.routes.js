import { protectedRouter } from "../../middleware/protect.js";
import { ROLES } from "../../constants/index.js";
import { listController, getController, resolveController } from "./task.controller.js";

const router = protectedRouter(ROLES.ADMIN, ROLES.MANAGER, ROLES.REVIEWER);

router.get("/", listController);
router.get("/:id", getController);
router.post("/:id/resolve", resolveController);

export { router as taskRoutes };
