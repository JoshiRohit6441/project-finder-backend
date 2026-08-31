import { protectedRouter } from "../../middleware/protect.js";
import { ROLES } from "../../constants/index.js";
import {
  listJobsController,
  getJobController,
  cancelJobController,
  retryJobController,
} from "./job.controller.js";

const router = protectedRouter(ROLES.ADMIN, ROLES.MANAGER);

router.get("/", listJobsController);
router.get("/:id", getJobController);
router.post("/:id/cancel", cancelJobController);
router.post("/:id/retry", retryJobController);

export { router as jobRoutes };
