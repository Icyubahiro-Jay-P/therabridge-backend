import mongoose from "mongoose";

const therryMessageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 4000,
    },
    category: {
      type: String,
      default: "general",
    },
  },
  { timestamps: true }
);

therryMessageSchema.index({ user: 1, createdAt: 1 });

export const TherryMessage = mongoose.model(
  "TherryMessage",
  therryMessageSchema
);
