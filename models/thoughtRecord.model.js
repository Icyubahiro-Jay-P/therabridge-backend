import mongoose from "mongoose"
import { decryptFieldLength } from "../utils/crypto.js"

const thoughtRecordSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    situation: {
      type: String,
      required: true,
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 500,
        message: "Situation must be at most 500 characters",
      },
    },
    automaticThought: {
      type: String,
      required: true,
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 500,
        message: "Automatic thought must be at most 500 characters",
      },
    },
    emotions: {
      type: String,
      required: true,
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 300,
        message: "Emotions must be at most 300 characters",
      },
    },
    emotionIntensity: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    distortionType: {
      type: String,
      enum: [
        "all_or_nothing",
        "overgeneralization",
        "mental_filter",
        "disqualifying_positive",
        "mind_reading",
        "fortune_telling",
        "magnification",
        "minimization",
        "emotional_reasoning",
        "should_statements",
        "labeling",
        "personalization",
        "none",
      ],
      default: "none",
    },
    evidenceFor: {
      type: String,
      validate: {
        validator: (v) => !v || (typeof v === "string" && decryptFieldLength(v) <= 500),
        message: "Evidence for must be at most 500 characters",
      },
    },
    evidenceAgainst: {
      type: String,
      validate: {
        validator: (v) => !v || (typeof v === "string" && decryptFieldLength(v) <= 500),
        message: "Evidence against must be at most 500 characters",
      },
    },
    reframe: {
      type: String,
      required: true,
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 500,
        message: "Reframe must be at most 500 characters",
      },
    },
    outcomeEmotion: {
      type: String,
      validate: {
        validator: (v) => !v || (typeof v === "string" && decryptFieldLength(v) <= 300),
        message: "Outcome emotion must be at most 300 characters",
      },
    },
    outcomeIntensity: {
      type: Number,
      min: 1,
      max: 10,
    },
    mood: {
      type: String,
      enum: ["great", "good", "okay", "bad", "terrible"],
      default: null,
    },
  },
  { timestamps: true },
)

thoughtRecordSchema.index({ user: 1, createdAt: -1 })

export default mongoose.model("ThoughtRecord", thoughtRecordSchema)
