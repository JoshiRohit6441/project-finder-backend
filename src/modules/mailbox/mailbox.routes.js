import express from "express";
import { protectedRouter } from "../../middleware/protect.js";
import { ROLES } from "../../constants/index.js";
import {
  statusController,
  oauthUrlController,
  oauthCallbackController,
  pollController,
  messagesController,
} from "./mailbox.controller.js";

const router = express.Router();
const secured = protectedRouter(ROLES.ADMIN, ROLES.MANAGER);

router.get("/oauth/callback", oauthCallbackController);
secured.get("/status", statusController);
secured.get("/messages", messagesController);
secured.get("/oauth/url", oauthUrlController);
secured.post("/poll", pollController);
router.use(secured);

export { router as mailboxRoutes };
