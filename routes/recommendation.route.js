import express from "express"
import { getRecommendations } from "../controllers/recommendation.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"
import { jsonBody } from "../middleware/jsonBody.js"

const router = express.Router()

router.use(jsonBody("10kb"))
router.use(authMiddleware)

router.get("/", getRecommendations)

export default router
