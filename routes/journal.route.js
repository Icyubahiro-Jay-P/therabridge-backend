import express from "express"
import {
  createEntry,
  getMyEntries,
  getEntry,
  updateEntry,
  deleteEntry,
  addComment,
  deleteComment,
  getPublicEntries,
} from "../controllers/journal.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"
import { jsonBody } from "../middleware/jsonBody.js"
import { validate, createJournalEntrySchema, updateJournalEntrySchema, addCommentSchema } from "../utils/validation.js"

const router = express.Router()

router.use(jsonBody("10kb"))
router.use(authMiddleware)

router.post("/", validate(createJournalEntrySchema), createEntry)
router.get("/", getMyEntries)
router.get("/public", getPublicEntries)
router.get("/:id", getEntry)
router.put("/:id", validate(updateJournalEntrySchema), updateEntry)
router.delete("/:id", deleteEntry)
router.post("/:id/comments", validate(addCommentSchema), addComment)
router.delete("/:id/comments/:commentId", deleteComment)

export default router
