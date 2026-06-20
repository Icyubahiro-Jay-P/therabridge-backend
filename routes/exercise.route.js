import express from "express";
import {
  getAllExercises,
  getExerciseById,
  createExercise,
} from "../controllers/exercise.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public routes
router.get("/", getAllExercises);
router.get("/:id", getExerciseById);

// Admin only
router.post("/", authMiddleware, createExercise);

export default router;
