import express from "express";
import {
  createCrisisAlert,
  getMyCrisisAlerts,
  acknowledgeCrisis,
  resolveCrisis,
  getAllActiveCrisisAlerts,
} from "../controllers/crisis.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/", createCrisisAlert);
router.get("/mine", getMyCrisisAlerts);
router.get("/active", getAllActiveCrisisAlerts);
router.put("/:id/acknowledge", acknowledgeCrisis);
router.put("/:id/resolve", resolveCrisis);

export default router;
