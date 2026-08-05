import express from "express";
import { getAuditLogs } from "../controllers/audit.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authMiddleware, requireAdmin);

router.get("/", getAuditLogs);

export default router;
