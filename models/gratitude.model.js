import mongoose from "mongoose"
import { decryptFieldLength } from "../utils/crypto.js"

const gratitudeEntrySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    promptId: {
      type: String,
      required: true,
    },
    promptText: {
      type: String,
      required: true,
      validate: {
        validator: (v) => typeof v === "string" && v.length <= 200,
        message: "Prompt text must be at most 200 characters",
      },
    },
    content: {
      type: String,
      required: true,
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 1000,
        message: "Content must be at most 1000 characters",
      },
    },
  },
  { timestamps: true },
)

gratitudeEntrySchema.index({ user: 1, createdAt: -1 })
gratitudeEntrySchema.index({ user: 1, promptId: 1, createdAt: -1 })

export default mongoose.model("GratitudeEntry", gratitudeEntrySchema)
