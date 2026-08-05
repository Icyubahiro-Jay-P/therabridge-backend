import SafetyPlan from "../models/safetyPlan.model.js";
import User from "../models/user.model.js";
import { encryptField, decryptField } from "../utils/crypto.js";
import {
  logAccess,
  ipFromReq,
  uaFromReq,
} from "../services/audit.service.js";

const SECTION_FIELDS = [
  "warningSigns",
  "internalCoping",
  "distractionPeople",
  "distractionSettings",
  "helpPeople",
  "professionals",
  "meansRestriction",
  "reasonsForLiving",
];

const decryptPlan = (doc) => {
  if (!doc) return doc;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const result = { ...obj };
  for (const field of SECTION_FIELDS) {
    result[field] = (obj[field] || []).map((item) => decryptField(item));
  }
  return result;
};

const encryptPlan = (plan) => {
  const encrypted = {};
  for (const field of SECTION_FIELDS) {
    encrypted[field] = (plan[field] || []).map((item) => encryptField(item));
  }
  return encrypted;
};

// GET /api/safety-plan - the caller's own plan (decrypted).
export const getMySafetyPlan = async (req, res) => {
  try {
    const plan = await SafetyPlan.findOne({ user: req.user.id });
    res.status(200).json(plan ? decryptPlan(plan) : {});
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

// PUT /api/safety-plan - create-or-replace the caller's plan. The single plan
// per user is modeled with a unique index on `user`, so upsert is safe.
export const upsertMySafetyPlan = async (req, res) => {
  try {
    const encrypted = encryptPlan(req.body);
    const plan = await SafetyPlan.findOneAndUpdate(
      { user: req.user.id },
      { $set: encrypted },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    const populatedSections = SECTION_FIELDS.filter(
      (field) => (encrypted[field] || []).length > 0,
    ).length;
    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: "safety_plan_update",
      targetType: "safety_plan",
      target: req.user.id,
      detail: { sectionsFilled: populatedSections },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });

    res.status(200).json({ message: "Safety plan saved.", plan: decryptPlan(plan) });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

// GET /api/safety-plan/:userId - read-only view for the client's assigned
// therapist (or an admin). Access is audit-logged.
export const getClientSafetyPlan = async (req, res) => {
  try {
    const { userId } = req.params;
    const client = await User.findById(userId);
    if (!client) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND" } });
    }
    if (
      req.user.role === "therapist" &&
      (!client.therapist || client.therapist.toString() !== req.user.id)
    ) {
      return res.status(403).json({
        error: { message: "You can only view safety plans for your assigned clients.", code: "FORBIDDEN" },
      });
    }

    const plan = await SafetyPlan.findOne({ user: userId });
    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: "safety_plan_view",
      targetType: "safety_plan",
      target: userId,
      detail: { exists: !!plan },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });

    res.status(200).json(plan ? decryptPlan(plan) : {});
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};
