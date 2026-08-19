import express from "express"
import {
  takeAssessment,
  getMyAssessments,
  getAssessment,
  getAssessmentTrend,
  deleteAssessment,
} from "../controllers/assessment.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"
import { jsonBody } from "../middleware/jsonBody.js"
import { validate, takeAssessmentSchema } from "../utils/validation.js"

const router = express.Router()

router.use(jsonBody("10kb"))
router.use(authMiddleware)

router.post("/", validate(takeAssessmentSchema), takeAssessment)
router.get("/", getMyAssessments)
router.get("/trend", getAssessmentTrend)
router.get("/:id", getAssessment)
router.delete("/:id", deleteAssessment)

export default router
