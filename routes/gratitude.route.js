import express from "express"
import {
  getDailyPrompt,
  createEntry,
  getMyEntries,
  getStreak,
  deleteEntry,
} from "../controllers/gratitude.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"
import { jsonBody } from "../middleware/jsonBody.js"
import { validate, createGratitudeEntrySchema } from "../utils/validation.js"

const router = express.Router()

router.use(jsonBody("10kb"))
router.use(authMiddleware)

router.get("/prompt", getDailyPrompt)
router.post("/", validate(createGratitudeEntrySchema), createEntry)
router.get("/", getMyEntries)
router.get("/streak", getStreak)
router.delete("/:id", deleteEntry)

export default router
