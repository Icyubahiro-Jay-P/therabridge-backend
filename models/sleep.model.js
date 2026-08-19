import mongoose from "mongoose"
import { decryptFieldLength } from "../utils/crypto.js"

const sleepLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    quality: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    bedtime: {
      type: String,
      default: "",
    },
    wakeTime: {
      type: String,
      default: "",
    },
    hoursSlept: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      default: "",
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 500,
        message: "Notes must be at most 500 characters",
      },
    },
    dreams: {
      type: String,
      default: "",
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 500,
        message: "Dreams must be at most 500 characters",
      },
    },
  },
  { timestamps: true },
)

sleepLogSchema.index({ user: 1, date: -1 })

const sleepContentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["sound", "meditation", "story"],
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    category: {
      type: String,
      enum: ["rain", "nature", "ambient", "meditation", "body_scan", "breathing"],
      required: true,
    },
    audioUrl: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
)

sleepContentSchema.index({ type: 1 })
sleepContentSchema.index({ category: 1 })

export const SleepLog = mongoose.model("SleepLog", sleepLogSchema)
export const SleepContent = mongoose.model("SleepContent", sleepContentSchema)
