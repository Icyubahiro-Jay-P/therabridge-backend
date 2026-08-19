import mongoose from "mongoose"

const assessmentResponseSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true },
    value: { type: Number, required: true, min: 0, max: 3 },
  },
  { _id: false },
)

const assessmentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["phq9", "gad7", "pss", "k10"],
    },
    responses: {
      type: [assessmentResponseSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1,
        message: "At least one response is required",
      },
    },
    score: {
      type: Number,
      required: true,
      min: 0,
    },
    severity: {
      type: String,
      required: true,
      enum: ["minimal", "mild", "moderate", "moderately_severe", "severe"],
    },
  },
  { timestamps: true },
)

assessmentSchema.index({ user: 1, type: 1, createdAt: -1 })

export default mongoose.model("Assessment", assessmentSchema)
