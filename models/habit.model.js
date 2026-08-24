import mongoose from "mongoose"
import { decryptFieldLength } from "../utils/crypto.js"

export const HABIT_COLORS = ["emerald", "sky", "violet", "amber", "rose", "teal"]

const habitSchema = new mongoose.Schema(
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
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 80,
        message: "Name must be at most 80 characters",
      },
    },
    emoji: {
      type: String,
      default: "✅",
      maxlength: 8,
    },
    color: {
      type: String,
      enum: HABIT_COLORS,
      default: "emerald",
    },
    // 0 = Sunday ... 6 = Saturday. Empty means the habit has no scheduled
    // days (paused); the UI treats it as unscheduled rather than daily.
    daysOfWeek: {
      type: [Number],
      default: [0, 1, 2, 3, 4, 5, 6],
      validate: {
        validator: (v) =>
          Array.isArray(v) &&
          v.length <= 7 &&
          v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        message: "daysOfWeek must contain integers 0-6",
      },
    },
    reminderTime: {
      type: String,
      default: null,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    active: {
      type: Boolean,
      default: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
)

habitSchema.index({ user: 1, active: 1 })

// One check-in per habit per calendar day. `date` is the client-local
// "YYYY-MM-DD" string so streak math matches what the user sees.
const habitLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    habit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Habit",
      required: true,
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
  },
  { timestamps: true },
)

habitLogSchema.index({ habit: 1, date: 1 }, { unique: true })
habitLogSchema.index({ user: 1, date: -1 })

export const Habit = mongoose.model("Habit", habitSchema)
export const HabitLog = mongoose.model("HabitLog", habitLogSchema)
