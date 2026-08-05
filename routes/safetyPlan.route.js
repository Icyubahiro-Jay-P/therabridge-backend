import express from "express";
import {
  getMySafetyPlan,
  upsertMySafetyPlan,
  getClientSafetyPlan,
} from "../controllers/safetyPlan.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdminOrTherapist } from "../middleware/role.middleware.js";
import { jsonBody } from "../middleware/jsonBody.js";
import { validate, safetyPlanSchema } from "../utils/validation.js";

const router = express.Router();

router.use(jsonBody("16kb"));
router.use(authMiddleware);

router.get("/", getMySafetyPlan);
router.put("/", validate(safetyPlanSchema), upsertMySafetyPlan);
router.get("/:userId", requireAdminOrTherapist, getClientSafetyPlan);

export default router;
