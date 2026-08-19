import mongoose from "mongoose"
import { decryptFieldLength } from "../utils/crypto.js"

const copingCardSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      required: true,
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 300,
        message: "Card text must be at most 300 characters",
      },
    },
    category: {
      type: String,
      required: true,
      enum: [
        "anxiety_coping",
        "self_compassion",
        "motivation",
        "crisis_survival",
        "gratitude",
        "encouragement",
        "custom",
      ],
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
    isTemplate: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
)

copingCardSchema.index({ user: 1, category: 1 })
copingCardSchema.index({ user: 1, isFavorite: 1 })
copingCardSchema.index({ isTemplate: 1, category: 1 })

export default mongoose.model("CopingCard", copingCardSchema)
