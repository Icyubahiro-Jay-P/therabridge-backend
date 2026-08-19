import express from "express"
import {
  createRecord,
  getMyRecords,
  getRecord,
  updateRecord,
  deleteRecord,
  getStats,
} from "../controllers/thoughtRecord.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"
import { jsonBody } from "../middleware/jsonBody.js"
import { validate, createThoughtRecordSchema, updateThoughtRecordSchema } from "../utils/validation.js"

const router = express.Router()

router.use(jsonBody("10kb"))
router.use(authMiddleware)

router.post("/", validate(createThoughtRecordSchema), createRecord)
router.get("/", getMyRecords)
router.get("/stats", getStats)
router.get("/:id", getRecord)
router.put("/:id", validate(updateThoughtRecordSchema), updateRecord)
router.delete("/:id", deleteRecord)

export default router
