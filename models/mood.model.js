import mongoose from "mongoose";

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
    emoji: {
      type: String,
      default: "",
    },
    note: {
      type: String,
      maxlength: 500,
      default: "",
    },
    factors: {
      type: [String],
      default: [],
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
