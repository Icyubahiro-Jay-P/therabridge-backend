import mongoose from "mongoose";
import Appointment from "../models/appointment.model.js";
import User from "../models/user.model.js";
import { encryptField, decryptField } from "../utils/crypto.js";
import {
  computeFreeSlots,
  dateToStr,
  slotsToDate,
  startOfDay,
  addDays,
} from "../utils/availability.js";
import { createNotification } from "../services/notification.service.js";
import { notificationQueue } from "../services/queue.js";
import { logAccess, ipFromReq, uaFromReq } from "../services/audit.service.js";

const clampDuration = (d) => Math.min(Math.max(parseInt(d, 10) || 50, 15), 120);

const timeStrOf = (date) => {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
};

const serialize = (doc) => {
  const obj = doc.toObject();
  obj.notes = decryptField(obj.notes);
  return obj;
};

const loadTherapist = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return User.findOne({ _id: id, role: "therapist" });
};

export const createAppointment = async (req, res) => {
  try {
    const { therapistId, date, time, duration, notes } = req.body;
    const dur = clampDuration(duration);
    const start = slotsToDate(date, time);

    if (start.getTime() < Date.now()) {
      return res.status(409).json({
        error: { message: "Cannot book a session in the past.", code: "SLOT_UNAVAILABLE", category: "USER" },
      });
    }

    const therapist = await loadTherapist(therapistId);
    if (!therapist) {
      return res.status(404).json({ error: { message: "Therapist not found.", code: "NOT_FOUND", category: "USER" } });
    }
    if (therapist._id.toString() === req.user.id) {
      return res.status(400).json({ error: { message: "You cannot book a session with yourself.", code: "VALIDATION_ERROR", category: "USER" } });
    }

    const from = startOfDay(start);
    const to = addDays(from, 1);
    const active = await Appointment.find({
      therapist: therapist._id,
      status: "confirmed",
      start: { $gte: from, $lt: to },
    }).select("start duration");

    const slots = computeFreeSlots({
      weeklyAvailability: therapist.weeklyAvailability,
      appointments: active,
      from,
      to,
      duration: dur,
    });

    if (!slots.some((s) => s.getTime() === start.getTime())) {
      return res.status(409).json({
        error: { message: "That time is no longer available. Please pick from the available slots.", code: "SLOT_UNAVAILABLE", category: "USER" },
      });
    }

    const appointment = new Appointment({
      user: req.user.id,
      therapist: therapist._id,
      start,
      duration: dur,
      notes: encryptField(notes || ""),
      type: "video",
    });
    await appointment.save();

    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: "appointment_created",
      targetType: "user",
      target: therapist._id,
      detail: { when: `${date} ${time}`, duration: dur },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });

    const bookedBy = `${req.user.firstName} ${req.user.lastName}`;
    await createNotification(
      therapist._id,
      "session_booked",
      "New session booked",
      `${bookedBy} booked a video session on ${date} at ${time}.`,
      { url: "/sessions", appointmentId: appointment._id.toString() },
      req.user.id,
    );

    const reminderDelay = Math.max(0, start.getTime() - Date.now() - 30 * 60 * 1000);
    await notificationQueue.add(
      "send-session-reminder",
      {
        userId: req.user.id,
        appointmentId: appointment._id.toString(),
        therapistName: `${therapist.firstName} ${therapist.lastName}`,
        date,
        time,
      },
      { delay: reminderDelay, removeOnComplete: true, removeOnFail: { count: 50 } },
    );

    appointment.user = req.user;
    appointment.therapist = therapist;
    res.status(201).json(serialize(appointment));
  } catch (error) {
    throw error;
  }
};

export const getMyAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({ user: req.user.id })
      .populate("therapist", "firstName lastName username avatar specialization sessionPrice")
      .sort({ start: -1 })
      .limit(100);
    res.status(200).json({ data: appointments.map(serialize) });
  } catch (error) {
    throw error;
  }
};

export const getTherapistAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({ therapist: req.user.id })
      .populate("user", "firstName lastName username avatar")
      .sort({ start: -1 })
      .limit(200);
    res.status(200).json({ data: appointments.map(serialize) });
  } catch (error) {
    throw error;
  }
};

export const getAvailability = async (req, res) => {
  try {
    const { therapistId } = req.query;
    const nDays = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 30);
    const dur = clampDuration(req.query.duration);

    const therapist = await loadTherapist(String(therapistId || ""));
    if (!therapist) {
      return res.status(404).json({ error: { message: "Therapist not found.", code: "NOT_FOUND", category: "USER" } });
    }

    const from = new Date();
    const to = addDays(from, nDays);
    const active = await Appointment.find({
      therapist: therapist._id,
      status: "confirmed",
      start: { $gte: from, $lt: to },
    }).select("start duration");

    const slots = computeFreeSlots({
      weeklyAvailability: therapist.weeklyAvailability,
      appointments: active,
      from,
      to,
      duration: dur,
    });

    res.status(200).json({
      duration: dur,
      slots: slots.map((s) => ({ date: dateToStr(s), time: timeStrOf(s) })),
    });
  } catch (error) {
    throw error;
  }
};

export const cancelAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: { message: "Appointment not found.", code: "NOT_FOUND", category: "USER" } });
    }
    const isParty =
      appointment.user.toString() === req.user.id ||
      (req.user.role === "therapist" &&
        appointment.therapist.toString() === req.user.id);
    if (!isParty) {
      return res.status(403).json({ error: { message: "You cannot cancel this appointment.", code: "FORBIDDEN", category: "USER" } });
    }

    if (appointment.status !== "cancelled") {
      appointment.status = "cancelled";
      appointment.cancelledBy = req.user.id;
      appointment.cancelledAt = new Date();
      await appointment.save();
    }

    const otherId =
      appointment.user.toString() === req.user.id
        ? appointment.therapist
        : appointment.user;
    const when = `${dateToStr(appointment.start)} ${timeStrOf(appointment.start)}`;
    await createNotification(
      otherId,
      "session_cancelled",
      "Session cancelled",
      `${req.user.firstName} ${req.user.lastName} cancelled the session on ${when}.`,
      { url: "/sessions", appointmentId: appointment._id.toString() },
      req.user.id,
    );

    res.status(200).json(serialize(appointment));
  } catch (error) {
    throw error;
  }
};

export const updateAppointmentStatus = async (req, res) => {
  try {
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      therapist: req.user.id,
    });
    if (!appointment) {
      return res.status(404).json({ error: { message: "Appointment not found.", code: "NOT_FOUND", category: "USER" } });
    }

    if (req.body.status === "cancelled") {
      appointment.cancelledBy = req.user.id;
      appointment.cancelledAt = new Date();
      const when = `${dateToStr(appointment.start)} ${timeStrOf(appointment.start)}`;
      await createNotification(
        appointment.user,
        "session_cancelled",
        "Session cancelled",
        `${req.user.firstName} ${req.user.lastName} cancelled the session on ${when}.`,
        { url: "/sessions", appointmentId: appointment._id.toString() },
        req.user.id,
      );
    }
    appointment.status = req.body.status;
    await appointment.save();

    res.status(200).json(serialize(appointment));
  } catch (error) {
    throw error;
  }
};