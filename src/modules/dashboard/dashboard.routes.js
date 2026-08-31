import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getDashboardController } from "./dashboard.controller.js";

const router = express.Router();

router.get("/", requireAuth, getDashboardController);

export { router as dashboardRoutes };
