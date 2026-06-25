import Crisis from "../models/crisis.model.js";
import User from "../models/user.model.js";
import { createNotification } from "./notification.controller.js";

export const createCrisisAlert = async (req, res) => {
  try {
    const { alertType, description } = req.body;
    if (!alertType) {
      return res.status(400).json({ message: "Alert type is required." });
    }
    const validTypes = ["immediate_danger", "severe_distress", "panic_attack", "self_harm_thoughts", "emergency"];
    if (!validTypes.includes(alertType)) {
      return res.status(400).json({ message: "Invalid alert type." });
    }
    const crisis = new Crisis({
      user: req.user.id,
      alertType,
      description: description || "",
    });
    await crisis.save();

    // Notify all therapists and admins
    const responders = await User.find({ role: { $in: ["therapist", "admin"] } });
    for (const responder of responders) {
      await createNotification(
        responder._id,
        "crisis_alert",
        "Crisis Alert",
        `A user has reported a crisis: ${alertType.replace(/_/g, " ")}`,
        { crisisId: crisis._id, userId: req.user.id },
        req.user.id
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

    res.status(201).json({
      message: "Your alert has been sent. Help is on the way.",
      crisis,
      resources: crisis.resourcesShared,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMyCrisisAlerts = async (req, res) => {
  try {
    const alerts = await Crisis.find({ user: req.user.id }).sort("-createdAt");
    res.status(200).json(alerts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const acknowledgeCrisis = async (req, res) => {
  try {
    const { id } = req.params;
    const crisis = await Crisis.findById(id);
    if (!crisis) {
      return res.status(404).json({ message: "Crisis alert not found." });
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
    res.status(200).json({ message: "Crisis acknowledged.", crisis });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const resolveCrisis = async (req, res) => {
  try {
    const { id } = req.params;
    const crisis = await Crisis.findById(id);
    if (!crisis) {
      return res.status(404).json({ message: "Crisis alert not found." });
    }
    crisis.status = "resolved";
    crisis.resolvedAt = new Date();
    await crisis.save();
    res.status(200).json({ message: "Crisis resolved.", crisis });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllActiveCrisisAlerts = async (req, res) => {
  try {
    const alerts = await Crisis.find({ status: "active" })
      .populate("user", "username firstName lastName avatar")
      .sort("-createdAt");
    res.status(200).json(alerts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
