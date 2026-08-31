import express from "express";
import { requireAuth } from "./auth.js";
import { requireRole } from "./rbac.js";

export function protectedRouter(...roles) {
  const router = express.Router();
  router.use(requireAuth, requireRole(...roles));
  return router;
}
