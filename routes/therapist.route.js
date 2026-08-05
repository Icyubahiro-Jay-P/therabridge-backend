import express from "express";
import { getClientsRiskSummary } from "../controllers/therapist.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireTherapist } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/clients/risk-summary", requireTherapist, getClientsRiskSummary);

export default router;
