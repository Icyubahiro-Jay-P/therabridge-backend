import express from "express"
import {
  createActivity,
  getMyActivities,
  getActivity,
  updateActivity,
  completeActivity,
  deleteActivity,
  getStats,
} from "../controllers/activity.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"
import { jsonBody } from "../middleware/jsonBody.js"
import { validate, createActivitySchema, completeActivitySchema } from "../utils/validation.js"

const router = express.Router()

router.use(jsonBody("10kb"))
router.use(authMiddleware)

router.post("/", validate(createActivitySchema), createActivity)
router.get("/", getMyActivities)
router.get("/stats", getStats)
router.get("/:id", getActivity)
router.put("/:id", updateActivity)
router.post("/:id/complete", validate(completeActivitySchema), completeActivity)
router.delete("/:id", deleteActivity)

export default router
