import express from "express";
import rateLimit from "express-rate-limit";
import { loginController, meController } from "./auth.controller.js";
import { requireAuth } from "../../middleware/auth.js";

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", loginLimiter, loginController);
router.get("/me", requireAuth, meController);

export { router as authRoutes };
