import mongoose from "mongoose";

// Exercise model — welcome exercises like 1 min breathing, body scan, gratitude, etc.
const exerciseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    duration: {
      type: Number, // in seconds
      required: true,
    },
    type: {
      type: String,
      enum: ["breathing", "mindfulness", "gratitude", "movement", "grounding"],
      required: true,
    },
    steps: [
      {
        instruction: { type: String, required: true },
        duration: { type: Number }, // per-step duration in seconds (optional)
      },
    ],
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },
    emoji: {
      type: String,
      default: "🌿",
    },
    color: {
      type: String,
      default: "#10b981",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Exercise", exerciseSchema);