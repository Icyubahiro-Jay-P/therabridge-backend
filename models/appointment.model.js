import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    therapist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    start: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number,
      default: 50,
      min: 15,
      max: 120,
    },
    type: {
      type: String,
      enum: ["video"],
      default: "video",
    },
    notes: {
      type: String,
      default: "",
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["confirmed", "completed", "cancelled", "missed"],
      default: "confirmed",
    },
    paid: {
      type: Boolean,
      default: false,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

appointmentSchema.index({ therapist: 1, start: 1 });
appointmentSchema.index({ user: 1, start: 1 });
appointmentSchema.index({ status: 1 });

export default mongoose.model("Appointment", appointmentSchema);