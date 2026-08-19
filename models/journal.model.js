import mongoose from "mongoose"
import { decryptFieldLength } from "../utils/crypto.js"

const commentSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 1000,
        message: "Comment must be at most 1000 characters",
      },
    },
  },
  { timestamps: true },
)

const journalEntrySchema = new mongoose.Schema(
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
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 200,
        message: "Title must be at most 200 characters",
      },
    },
    content: {
      type: String,
      required: true,
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 5000,
        message: "Content must be at most 5000 characters",
      },
    },
    mood: {
      type: String,
      enum: ["great", "good", "okay", "bad", "terrible"],
      default: null,
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => Array.isArray(v) && v.length <= 10,
        message: "Up to 10 tags allowed",
      },
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    comments: [commentSchema],
  },
  { timestamps: true },
)

journalEntrySchema.index({ user: 1, createdAt: -1 })

export default mongoose.model("JournalEntry", journalEntrySchema)
