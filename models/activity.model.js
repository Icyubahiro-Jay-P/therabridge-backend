import mongoose from "mongoose"
import { decryptFieldLength } from "../utils/crypto.js"

const activitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 100,
        message: "Title must be at most 100 characters",
      },
    },
    category: {
      type: String,
      required: true,
      enum: ["social", "physical", "creative", "productive", "relaxation", "outdoor", "learning", "self_care", "other"],
    },
    scheduledDate: {
      type: Date,
      required: true,
    },
    scheduledTime: {
      type: String,
      default: null,
    },
    duration: {
      type: Number,
      default: null,
      min: 0,
    },
    expectedPleasure: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    actualPleasure: {
      type: Number,
      default: null,
      min: 1,
      max: 10,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: null,
      validate: {
        validator: (v) => !v || (typeof v === "string" && decryptFieldLength(v) <= 500),
        message: "Notes must be at most 500 characters",
      },
    },
    moodBefore: {
      type: String,
      enum: ["great", "good", "okay", "bad", "terrible"],
      default: null,
    },
    moodAfter: {
      type: String,
      enum: ["great", "good", "okay", "bad", "terrible"],
      default: null,
    },
  },
  { timestamps: true },
)

activitySchema.index({ user: 1, scheduledDate: 1 })
activitySchema.index({ user: 1, completed: 1 })

export default mongoose.model("Activity", activitySchema)
