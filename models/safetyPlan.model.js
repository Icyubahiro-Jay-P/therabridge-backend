import mongoose from "mongoose";
import { decryptFieldLength } from "../utils/crypto.js";

// Per-user crisis safety plan (one per user). Each section is a short list of
// user-authored items. Items are encrypted at rest like mood notes and crisis
// descriptions; the plaintext cap is enforced against the decrypted value.

const MAX_SAFETY_PLAN_ITEMS = 10;
const MAX_SAFETY_PLAN_ITEM_LENGTH = 120;

const safetyPlanList = {
  type: [
    {
      type: String,
      validate: {
        validator: (v) =>
          typeof v === "string" &&
          decryptFieldLength(v) <= MAX_SAFETY_PLAN_ITEM_LENGTH,
        message: `Each safety plan item must be at most ${MAX_SAFETY_PLAN_ITEM_LENGTH} characters`,
      },
    },
  ],
  default: [],
  maxlength: MAX_SAFETY_PLAN_ITEMS,
};

const safetyPlanSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    // Things that mean I might be moving toward a crisis
    warningSigns: safetyPlanList,
    // Coping strategies I can do on my own
    internalCoping: safetyPlanList,
    // People and social settings that can distract me
    distractionPeople: safetyPlanList,
    distractionSettings: safetyPlanList,
    // People I can ask for help
    helpPeople: safetyPlanList,
    // Professionals or agencies I can contact
    professionals: safetyPlanList,
    // Steps to keep my means of harm away from me
    meansRestriction: safetyPlanList,
    // Reasons to keep living
    reasonsForLiving: safetyPlanList,
  },
  { timestamps: true }
);

safetyPlanSchema.index({ user: 1 });

export default mongoose.model("SafetyPlan", safetyPlanSchema);
