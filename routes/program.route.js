import express from "express"
import {
  getPrograms,
  getProgram,
  startProgram,
  completeActivity,
  getMyPrograms,
} from "../controllers/program.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"
import { jsonBody } from "../middleware/jsonBody.js"

const router = express.Router()

router.use(jsonBody("10kb"))
router.use(authMiddleware)

router.get("/", getPrograms)
router.get("/mine", getMyPrograms)
router.get("/:id", getProgram)
router.post("/:id/start", startProgram)
router.post("/:id/complete", completeActivity)

export default router
