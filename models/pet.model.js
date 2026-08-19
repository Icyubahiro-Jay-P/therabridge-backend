import mongoose from "mongoose";

const petAdventureSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const petSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    name: {
      type: String,
      default: "Sage",
      trim: true,
      validate: {
        validator: (v) => typeof v === "string" && v.length <= 30,
        message: "Pet name must be at most 30 characters",
      },
    },
    level: {
      type: Number,
      default: 1,
      min: 1,
    },
    experience: {
      type: Number,
      default: 0,
      min: 0,
    },
    mood: {
      type: String,
      enum: ["happy", "content", "sad", "neutral"],
      default: "content",
    },
    hunger: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
    accessories: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => Array.isArray(v) && v.length <= 20,
        message: "Up to 20 accessories allowed",
      },
    },
    adventureLog: {
      type: [petAdventureSchema],
      default: [],
    },
    lastFedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

petSchema.index({ user: 1 });

export default mongoose.model("Pet", petSchema);
