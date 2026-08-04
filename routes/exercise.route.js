import express from "express";
import {
  getAllExercises,
  getExerciseById,
  createExercise,
} from "../controllers/exercise.controller.js";
import {
  startExercise,
  completeExercise,
  getLogs,
  getExerciseStats,
} from "../controllers/exerciseLog.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";
import { validate, createExerciseSchema } from "../utils/validation.js";

const router = express.Router();

// Public routes
router.get("/", getAllExercises);

// Exercise tracking (authenticated) — must be before /:id
router.get("/logs/mine", authMiddleware, getLogs);
router.get("/stats", authMiddleware, getExerciseStats);
router.post("/:id/start", authMiddleware, startExercise);
router.post("/:id/complete", authMiddleware, completeExercise);

// Public
router.get("/:id", getExerciseById);

// Admin only
router.post("/", authMiddleware, requireAdmin, validate(createExerciseSchema), createExercise);

export default router;
