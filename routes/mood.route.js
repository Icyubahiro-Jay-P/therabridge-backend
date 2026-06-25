import express from "express";
import {
  logMood,
  getMyMoods,
  getMoodStats,
  deleteMood,
} from "../controllers/mood.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/", logMood);
router.get("/", getMyMoods);
router.get("/stats", getMoodStats);
router.delete("/:id", deleteMood);

export default router;
