import express from "express"
import {
  getModules,
  getModule,
  startModule,
  completeStep,
  getMyProgress,
} from "../controllers/psychoedModule.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"
import { jsonBody } from "../middleware/jsonBody.js"

const router = express.Router()

router.use(jsonBody("10kb"))
router.use(authMiddleware)

router.get("/", getModules)
router.get("/progress", getMyProgress)
router.get("/:id", getModule)
router.post("/:id/start", startModule)
router.post("/:id/complete-step", completeStep)

export default router
