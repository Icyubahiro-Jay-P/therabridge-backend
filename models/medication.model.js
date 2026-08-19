import mongoose from "mongoose"
import { decryptFieldLength } from "../utils/crypto.js"

const medicationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 100,
        message: "Name must be at most 100 characters",
      },
    },
    dosage: {
      type: String,
      required: true,
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 50,
        message: "Dosage must be at most 50 characters",
      },
    },
    frequency: {
      type: String,
      enum: ["daily", "twice_daily", "three_times", "weekly", "as_needed"],
      required: true,
    },
    timeOfDay: {
      type: String,
      default: null,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      default: null,
      validate: {
        validator: (v) => !v || (typeof v === "string" && decryptFieldLength(v) <= 200),
        message: "Notes must be at most 200 characters",
      },
    },
  },
  { timestamps: true },
)

medicationSchema.index({ user: 1, active: 1 })
medicationSchema.index({ user: 1, createdAt: -1 })

const medicationLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    medication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Medication",
      required: true,
    },
    takenAt: {
      type: Date,
      default: Date.now,
    },
    skipped: {
      type: Boolean,
      default: false,
    },
    sideEffects: {
      type: [String],
      default: [],
      validate: {
        validator: (v) =>
          Array.isArray(v) &&
          v.length <= 10 &&
          v.every((s) => typeof s === "string" && s.length <= 100),
        message: "At most 10 side effects, each ≤100 characters",
      },
    },
    notes: {
      type: String,
      default: null,
      validate: {
        validator: (v) => !v || (typeof v === "string" && decryptFieldLength(v) <= 200),
        message: "Notes must be at most 200 characters",
      },
    },
  },
  { timestamps: true },
)

medicationLogSchema.index({ user: 1, takenAt: -1 })
medicationLogSchema.index({ user: 1, medication: 1 })
medicationLogSchema.index({ user: 1, medication: 1, takenAt: -1 })

export const Medication = mongoose.model("Medication", medicationSchema)
export const MedicationLog = mongoose.model("MedicationLog", medicationLogSchema)
