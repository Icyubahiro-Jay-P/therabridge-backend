import express from "express"
import {
  logSleep,
  getMyLogs,
  getSleepStats,
  getContent,
  deleteLog,
} from "../controllers/sleep.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"
import { jsonBody } from "../middleware/jsonBody.js"
import { validate, logSleepSchema } from "../utils/validation.js"

const router = express.Router()

router.use(jsonBody("10kb"))
router.use(authMiddleware)

router.post("/", validate(logSleepSchema), logSleep)
router.get("/", getMyLogs)
router.get("/stats", getSleepStats)
router.get("/content", getContent)
router.delete("/:id", deleteLog)

export default router
