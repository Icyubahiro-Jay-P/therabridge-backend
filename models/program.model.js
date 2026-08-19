import mongoose from "mongoose"

const activityItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    type: {
      type: String,
      enum: ["reading", "reflection", "exercise", "checkin"],
      required: true,
    },
    duration: { type: String, required: true },
  },
  { _id: true },
)

const weekSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    activities: {
      type: [activityItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 10,
        message: "Each week must have 1–10 activities",
      },
    },
  },
  { _id: true },
)

const programSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ["anxiety", "mood", "stress", "sleep", "resilience"],
      required: true,
    },
    duration: { type: String, required: true },
    weeks: {
      type: [weekSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 12,
        message: "Program must have 1–12 weeks",
      },
    },
  },
  { timestamps: true },
)

programSchema.index({ category: 1 })

const userProgressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
      required: true,
    },
    currentWeek: { type: Number, default: 0 },
    currentActivity: { type: Number, default: 0 },
    completedWeeks: { type: [Number], default: [] },
    completedActivities: {
      type: [{ weekIndex: Number, activityIndex: Number }],
      default: [],
    },
    startedAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

userProgressSchema.index({ user: 1, program: 1 }, { unique: true })
userProgressSchema.index({ user: 1 })

export const Program = mongoose.model("Program", programSchema)
export const UserProgress = mongoose.model("UserProgress", userProgressSchema)
