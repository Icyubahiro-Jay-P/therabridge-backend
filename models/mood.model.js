import mongoose from "mongoose";
import { decryptFieldLength } from "../utils/crypto.js";

const moodSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    mood: {
      type: String,
      enum: ["great", "good", "okay", "bad", "terrible"],
      required: true,
    },
    note: {
      type: String,
      default: "",
      // Encrypted at rest; enforce the plaintext cap against the decrypted value.
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 500,
        message: "Note must be at most 500 characters",
      },
    },
    factors: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => Array.isArray(v) && v.length <= 20,
        message: "Up to 20 factors allowed",
      },
    },
    intensity: {
      type: Number,
      min: 1,
      max: 10,
      default: 5,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

moodSchema.index({ user: 1, date: -1 });

export default mongoose.model("Mood", moodSchema);
