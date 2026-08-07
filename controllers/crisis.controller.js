import Crisis from "../models/crisis.model.js";
import CrisisLog from "../models/crisisLog.model.js";
import User from "../models/user.model.js";
import { getPanicExercise } from "./exercise.controller.js";
import { createNotification } from "../services/notification.service.js";
import { encryptField, decryptField } from "../utils/crypto.js";
import { getHotlinesForCountry } from "../utils/hotlines.js";
import {
  logAccess,
  ipFromReq,
  uaFromReq,
} from "../services/audit.service.js";
import {
  getPaginationParams,
  formatPaginatedResponse,
} from "../utils/pagination.js";

const decryptCrisis = (doc) => {
  if (!doc) return doc;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    ...obj,
    description: decryptField(obj.description),
  };
};

const decryptCrisisLog = (doc) => {
  if (!doc) return doc;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    ...obj,
    excerpt: decryptField(obj.excerpt),
  };
};

export const createCrisisAlert = async (req, res) => {
  try {
    const { alertType, description, severity = "medium", requestContact = false } = req.body;
    if (!alertType) {
      return res.status(400).json({ error: { message: "Alert type is required.", code: "VALIDATION_ERROR" } });
    }
    const validTypes = ["immediate_danger", "severe_distress", "panic_attack", "self_harm_thoughts", "emergency"];
    if (!validTypes.includes(alertType)) {
      return res.status(400).json({ error: { message: "Invalid alert type.", code: "VALIDATION_ERROR" } });
    }
    const crisis = new Crisis({
      user: req.user.id,
      alertType,
      severity,
      description: encryptField(description || ""),
    });
    await crisis.save();

    // Escalation rule: severe alerts notify responders urgently, medium alerts
    // notify non-urgently, mild alerts are logged only unless the user asked to
    // be contacted.
    const logSeverityMap = { severe: "critical", medium: "high", mild: "low" };
    await CrisisLog.create({
      user: req.user.id,
      therryMessageId: null,
      excerpt: encryptField(description ? description.slice(0, 280) : ""),
      source: "manual",
      actionTaken: "crisis_alert_created",
      severity: logSeverityMap[severity] ?? "high",
      detectedAt: new Date(),
    });

    const notifyResponders =
      severity === "severe" ||
      severity === "medium" ||
      (severity === "mild" && requestContact);
    const responders = await User.find({ role: { $in: ["therapist", "admin"] } }).select("_id");
    if (notifyResponders && responders.length > 0) {
      const urgent = severity === "severe";
      await Promise.all(
        responders.map((responder) =>
          createNotification(
            responder._id,
            "crisis_alert",
            urgent ? "URGENT Crisis Alert" : "Crisis Alert",
            urgent
              ? `A user needs immediate help: ${alertType.replace(/_/g, " ")}`
              : `A user has reported a crisis: ${alertType.replace(/_/g, " ")}`,
            { crisisId: crisis._id, userId: req.user.id, source: "manual", severity, ...(urgent ? { priority: "urgent" } : {}) },
            req.user.id
          )
        )
      );
    }

    const crisisResources = {
      immediate_danger: ["Call 911 or your local emergency number", "Contact a trusted person nearby"],
      severe_distress: ["Crisis Text Line: Text HOME to 741741", "National Suicide Prevention Lifeline: 988"],
      panic_attack: ["Try 4-7-8 breathing", "Ground yourself with 5-4-3-2-1 senses"],
      self_harm_thoughts: ["Call 988 Suicide & Crisis Lifeline", "Text HOME to 741741"],
      emergency: ["Call 911 immediately", "Go to your nearest emergency room"],
    };

    crisis.resourcesShared = crisisResources[alertType] || [];
    await crisis.save();

    // Panic attacks get a grounding/breathing exercise as the first response,
    // surfaced alongside the crisis card (B2).
    const panicExercise =
      alertType === "panic_attack" ? await getPanicExercise() : null;

    res.status(201).json({
      message: "Your alert has been sent. Help is on the way.",
      crisis: decryptCrisis(crisis),
      resources: crisis.resourcesShared,
      ...(panicExercise ? { panicExercise } : {}),
    });
  } catch (error) {
    throw error;
  }
};

export const getMyCrisisAlerts = async (req, res) => {
  try {
    const alerts = await Crisis.find({ user: req.user.id }).sort("-createdAt");
    res.status(200).json(alerts.map(decryptCrisis));
  } catch (error) {
    throw error;
  }
};

export const acknowledgeCrisis = async (req, res) => {
  try {
    const { id } = req.params;
    const crisis = await Crisis.findById(id);
    if (!crisis) {
      return res.status(404).json({ error: { message: "Crisis alert not found.", code: "NOT_FOUND" } });
    }
    if (
      crisis.user.toString() !== req.user.id &&
      req.user.role !== "therapist" &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: { message: "You can only acknowledge your own crisis alerts.", code: "FORBIDDEN" } });
    }
    if (crisis.status !== "active") {
      return res.status(400).json({ error: { message: "Crisis alert already acknowledged or resolved.", code: "BAD_REQUEST" } });
    }
    crisis.status = "acknowledged";
    crisis.acknowledgedBy = req.user.id;
    await crisis.save();
    await createNotification(
      crisis.user,
      "crisis_alert",
      "Crisis Alert Acknowledged",
      "A therapist has acknowledged your crisis alert and will reach out soon.",
      { crisisId: crisis._id }
    );
    res.status(200).json({ message: "Crisis acknowledged.", crisis: decryptCrisis(crisis) });
  } catch (error) {
    throw error;
  }
};

export const resolveCrisis = async (req, res) => {
  try {
    const { id } = req.params;
    const crisis = await Crisis.findById(id);
    if (!crisis) {
      return res.status(404).json({ error: { message: "Crisis alert not found.", code: "NOT_FOUND" } });
    }
    if (
      crisis.user.toString() !== req.user.id &&
      req.user.role !== "therapist" &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: { message: "You can only resolve your own crisis alerts.", code: "FORBIDDEN" } });
    }
    crisis.status = "resolved";
    crisis.resolvedAt = new Date();
    await crisis.save();
    res.status(200).json({ message: "Crisis resolved.", crisis: decryptCrisis(crisis) });
  } catch (error) {
    throw error;
  }
};

export const getAllActiveCrisisAlerts = async (req, res) => {
  try {
    const alerts = await Crisis.find({ status: "active" })
      .populate("user", "username firstName lastName avatar")
      .sort("-createdAt");

    // Access to the crisis list is a privacy-sensitive event worth an audit
    // trail for accountability.
    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: "crisis_view",
      targetType: "crisis",
      detail: { scope: "active_alerts", count: alerts.length },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });

    res.status(200).json(alerts.map(decryptCrisis));
  } catch (error) {
    throw error;
  }
};

// ====================== CRISIS LOGS (Therry + manual escalation review) ======================

export const getCrisisLogs = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query, 50);
    const filter = {};
    if (req.query.source) filter.source = req.query.source;
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.userId) filter.user = req.query.userId;

    const total = await CrisisLog.countDocuments(filter);
    const logs = await CrisisLog.find(filter)
      .sort({ detectedAt: -1 })
      .skip(offset)
      .limit(limit)
      .populate("user", "username firstName lastName avatar");

    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: "crisis_view",
      targetType: "crisis",
      detail: { scope: "logs", count: total },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });

    res.status(200).json(formatPaginatedResponse(logs.map(decryptCrisisLog), total, page, limit));
  } catch (error) {
    throw error;
  }
};

export const updateCrisisLogAction = async (req, res) => {
  try {
    const { logId } = req.params;
    const { actionTaken } = req.body;
    const validActions = ["none", "hotlines_shown", "crisis_alert_created", "therapist_messaged"];
    if (!validActions.includes(actionTaken)) {
      return res.status(400).json({ error: { message: "Invalid actionTaken value.", code: "VALIDATION_ERROR" } });
    }

    const log = await CrisisLog.findById(logId);
    if (!log) {
      return res.status(404).json({ error: { message: "Crisis log not found.", code: "NOT_FOUND" } });
    }

    log.actionTaken = actionTaken;
    if (actionTaken === "therapist_messaged" || actionTaken === "crisis_alert_created") {
      log.resolvedAt = new Date();
    }
    await log.save();

    res.status(200).json({ message: "Crisis log updated.", log: decryptCrisisLog(log) });
  } catch (error) {
    throw error;
  }
};

export const getHotlines = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("countryCode");
    res.status(200).json(getHotlinesForCountry(user?.countryCode));
  } catch (error) {
    throw error;
  }
};

export const messageTherapist = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("therapist");
    if (!user?.therapist) {
      return res.status(400).json({ error: { message: "No therapist is assigned to your account yet.", code: "NO_THERAPIST" } });
    }
    const therapistId = user.therapist;
    const therapist = await User.findById(therapistId).select("isDisabled");
    if (!therapist || therapist.isDisabled) {
      return res.status(400).json({ error: { message: "No therapist is assigned to your account yet.", code: "NO_THERAPIST" } });
    }

    const created = await createNotification(
      therapistId,
      "crisis_alert",
      "Crisis Contact Request",
      "A client in crisis has reached out for help. Please respond as soon as possible.",
      { userId: req.user.id, source: "therry" },
      req.user.id,
    );
    if (!created) {
      return res.status(500).json({ error: { message: "Failed to notify your therapist. Please try again.", code: "INTERNAL_ERROR" } });
    }

    res.status(200).json({ message: "Your therapist has been notified." });
  } catch (error) {
    throw error;
  }
};
