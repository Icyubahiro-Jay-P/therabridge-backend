import express from "express";
import { getDashboard } from "../controllers/admin.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";
import { jsonBody } from "../middleware/jsonBody.js";

const router = express.Router();

router.use(jsonBody("10kb"));

router.get("/dashboard", authMiddleware, requireAdmin, getDashboard);

export default router;
