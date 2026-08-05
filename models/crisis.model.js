import mongoose from "mongoose";

const crisisSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    alertType: {
      type: String,
      enum: ["immediate_danger", "severe_distress", "panic_attack", "self_harm_thoughts", "emergency"],
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    // Where the alert originated: the in-app crisis button ("manual") or
    // detected automatically by Therry ("therry")
    source: {
      type: String,
      enum: ["manual", "therry"],
      default: "manual",
    },
    therryMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TherryMessage",
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "acknowledged", "resolved"],
      default: "active",
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resourcesShared: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

crisisSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Crisis", crisisSchema);
