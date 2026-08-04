import express from "express";
import {
  createCrisisAlert,
  getMyCrisisAlerts,
  acknowledgeCrisis,
  resolveCrisis,
  getAllActiveCrisisAlerts,
} from "../controllers/crisis.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdminOrTherapist } from "../middleware/role.middleware.js";
import { validate, createCrisisSchema } from "../utils/validation.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/", validate(createCrisisSchema), createCrisisAlert);
router.get("/mine", getMyCrisisAlerts);
router.get("/active", requireAdminOrTherapist, getAllActiveCrisisAlerts);
router.put("/:id/acknowledge", acknowledgeCrisis);
router.put("/:id/resolve", resolveCrisis);

export default router;
