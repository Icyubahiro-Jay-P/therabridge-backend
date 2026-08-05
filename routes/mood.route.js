import express from "express";
import {
  logMood,
  getMyMoods,
  getMoodStats,
  deleteMood,
} from "../controllers/mood.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { jsonBody } from "../middleware/jsonBody.js";
import { validate, logMoodSchema } from "../utils/validation.js";

const router = express.Router();

router.use(jsonBody("10kb"));
router.use(authMiddleware);

router.post("/", validate(logMoodSchema), logMood);
router.get("/", getMyMoods);
router.get("/stats", getMoodStats);
router.delete("/:id", deleteMood);

export default router;
