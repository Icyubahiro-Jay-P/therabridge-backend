import express from "express"
import {
  createHabit,
  getMyHabits,
  updateHabit,
  deleteHabit,
  toggleHabitCheckIn,
} from "../controllers/habit.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"
import { jsonBody } from "../middleware/jsonBody.js"
import { validate, createHabitSchema, updateHabitSchema, toggleHabitSchema } from "../utils/validation.js"

const router = express.Router()

router.use(jsonBody("10kb"))
router.use(authMiddleware)

router.post("/", validate(createHabitSchema), createHabit)
router.get("/", getMyHabits)
router.put("/:id", validate(updateHabitSchema), updateHabit)
router.delete("/:id", deleteHabit)
router.post("/:id/toggle", validate(toggleHabitSchema), toggleHabitCheckIn)

export default router
