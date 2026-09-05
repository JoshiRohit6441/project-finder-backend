import { protectedRouter } from "../../middleware/protect.js";
import { ROLES } from "../../constants/index.js";
import {
  listLeadsController,
  getLeadController,
  approveController,
  statusController,
  flagsController,
  contactController,
  proposalController,
  callQueueController,
  callLogController,
  assignController,
  notesController,
  findEmailController,
  usersController,
} from "./lead.controller.js";

const router = protectedRouter(ROLES.ADMIN, ROLES.MANAGER, ROLES.REVIEWER);

router.get("/", listLeadsController);
router.get("/call-queue", callQueueController);
router.get("/users", usersController);
router.get("/:id", getLeadController);
router.post("/:id/approve-outreach", approveController);
router.patch("/:id/status", statusController);
router.patch("/:id/flags", flagsController);
router.patch("/:id/contact", contactController);
router.patch("/:id/assign", assignController);
router.patch("/:id/notes", notesController);
router.post("/:id/call-log", callLogController);
router.post("/:id/find-email", findEmailController);
router.post("/:id/proposal", proposalController);

export { router as leadRoutes };
