import express from "express";
import {
  createAppointment,
  getMyAppointments,
  getTherapistAppointments,
  getAvailability,
  cancelAppointment,
  updateAppointmentStatus,
} from "../controllers/appointment.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireTherapist } from "../middleware/role.middleware.js";
import { jsonBody } from "../middleware/jsonBody.js";
import { validate } from "../utils/validation.js";
import { createAppointmentSchema, updateAppointmentStatusSchema } from "../utils/validation.js";

const router = express.Router();

router.use(authMiddleware);
router.use(jsonBody("16kb"));

router.get("/availability", getAvailability);
router.get("/mine", getMyAppointments);
router.post("/", validate(createAppointmentSchema), createAppointment);
router.delete("/:id", cancelAppointment);

router.get("/therapist", requireTherapist, getTherapistAppointments);
router.put("/therapist/:id/status", requireTherapist, validate(updateAppointmentStatusSchema), updateAppointmentStatus);

export default router;