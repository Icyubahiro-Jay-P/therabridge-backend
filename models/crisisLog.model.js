import mongoose from "mongoose";

// Machine-readable record of every crisis classification produced by Therry
// (and manual crisis-alert source events), so therapists/admins can review and
// follow up on escalation events over time. `excerpt` holds an encrypted
// snippet of the triggering message; full context lives in TherryMessage.
const crisisLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // TherryMessage that triggered detection (null for manual events)
    therryMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TherryMessage",
      default: null,
    },
    excerpt: {
      type: String,
      default: "",
    },
    source: {
      type: String,
      enum: ["therry", "manual"],
      required: true,
    },
    actionTaken: {
      type: String,
      enum: [
        "none",
        "hotlines_shown",
        "crisis_alert_created",
        "therapist_messaged",
      ],
      default: "none",
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

crisisLogSchema.index({ user: 1, createdAt: -1 });
crisisLogSchema.index({ detectedAt: -1 });
crisisLogSchema.index({ severity: 1, detectedAt: -1 });

export default mongoose.model("CrisisLog", crisisLogSchema);
