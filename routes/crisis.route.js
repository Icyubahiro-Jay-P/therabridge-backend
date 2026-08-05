import express from "express";
import {
  createCrisisAlert,
  getMyCrisisAlerts,
  acknowledgeCrisis,
  resolveCrisis,
  getAllActiveCrisisAlerts,
  getCrisisLogs,
  updateCrisisLogAction,
  getHotlines,
  messageTherapist,
} from "../controllers/crisis.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdminOrTherapist } from "../middleware/role.middleware.js";
import { jsonBody } from "../middleware/jsonBody.js";
import { validate, createCrisisSchema, updateCrisisLogSchema } from "../utils/validation.js";

const router = express.Router();

router.use(jsonBody("16kb"));
router.use(authMiddleware);

router.post("/", validate(createCrisisSchema), createCrisisAlert);
router.get("/mine", getMyCrisisAlerts);
router.get("/active", requireAdminOrTherapist, getAllActiveCrisisAlerts);
router.get("/hotlines", getHotlines);
router.get("/logs", requireAdminOrTherapist, getCrisisLogs);
router.post("/logs/:logId/action", requireAdminOrTherapist, validate(updateCrisisLogSchema), updateCrisisLogAction);
router.post("/message-therapist", messageTherapist);
router.put("/:id/acknowledge", acknowledgeCrisis);
router.put("/:id/resolve", resolveCrisis);

export default router;
