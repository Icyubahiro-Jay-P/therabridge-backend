import express from "express"
import {
  createCard,
  getMyCards,
  toggleFavorite,
  deleteCard,
} from "../controllers/copingCard.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"
import { jsonBody } from "../middleware/jsonBody.js"
import { validate, createCopingCardSchema } from "../utils/validation.js"

const router = express.Router()

router.use(jsonBody("10kb"))
router.use(authMiddleware)

router.post("/", validate(createCopingCardSchema), createCard)
router.get("/", getMyCards)
router.patch("/:id/favorite", toggleFavorite)
router.delete("/:id", deleteCard)

export default router
