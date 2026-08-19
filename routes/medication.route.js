import express from "express"
import {
  createMedication,
  getMyMedications,
  updateMedication,
  deleteMedication,
  logDose,
  getMyLogs,
  getAdherenceStats,
} from "../controllers/medication.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"
import { jsonBody } from "../middleware/jsonBody.js"
import {
  validate,
  createMedicationSchema,
  updateMedicationSchema,
  logDoseSchema,
} from "../utils/validation.js"

const router = express.Router()

router.use(jsonBody("10kb"))
router.use(authMiddleware)

router.post("/", validate(createMedicationSchema), createMedication)
router.get("/", getMyMedications)
router.get("/logs", getMyLogs)
router.get("/stats", getAdherenceStats)
router.put("/:id", validate(updateMedicationSchema), updateMedication)
router.delete("/:id", deleteMedication)
router.post("/log", validate(logDoseSchema), logDose)

export default router
