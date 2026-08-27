import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    provider: {
      type: String,
      default: "stripe",
    },
    stripeCustomerId: {
      type: String,
      default: null,
    },
    attempt: {
      type: String,
      default: null,
    },
    intent: {
      type: String,
      enum: ["subscribe", "session"],
      required: true,
    },
    plan: {
      type: String,
      enum: ["monthly"],
      default: null,
    },
    amount: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: "usd",
    },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled"],
      default: "pending",
    },
    invoiceUrl: {
      type: String,
      default: null,
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      default: null,
    },
    currentPeriodEnd: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

paymentSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Payment", paymentSchema);