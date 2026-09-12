import User from "../models/user.model.js";
import { logAccess, ipFromReq, uaFromReq } from "../services/audit.service.js";
import { createNotification } from "../services/notification.service.js";

// Therapists see the users assigned to them (their client roster)
export const getTherapistClients = async (req, res) => {
  try {
    const clients = await User.find({ therapist: req.user.id })
      .select("_id username firstName lastName avatar bio email createdAt role")
      .sort({ createdAt: -1 });

    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: "client_roster_view",
      targetType: "user",
      detail: { count: clients.length },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });

    res.status(200).json(clients);
  } catch (error) {
    throw error;
  }
};

// Therapist requests to add a regular user to their roster. This only opens
// a pending request — the user must approve it via respondTherapistRequest
// before the therapist gains access to their safety plan/crisis data.
export const addTherapistClient = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND", category: "USER" } });
    }
    if (user.role !== "user") {
      return res.status(400).json({ error: { message: "Only regular users can be added as clients.", code: "VALIDATION_ERROR", category: "USER" } });
    }
    if (user.therapist && user.therapist.toString() !== req.user.id) {
      return res.status(409).json({ error: { message: "This user already has a therapist.", code: "CONFLICT", category: "USER" } });
    }
    if (user.pendingTherapistRequest) {
      return res.status(409).json({
        error: {
          message: user.pendingTherapistRequest.toString() === req.user.id
            ? "You already have a pending request with this user."
            : "This user already has a pending request from another therapist.",
          code: "CONFLICT",
          category: "USER",
        },
      });
    }

    user.pendingTherapistRequest = req.user.id;
    await user.save();

    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: "therapist_request_sent",
      targetType: "user",
      target: user._id,
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });

    await createNotification(
      user._id,
      "therapist_request",
      "Therapist connection request",
      `${req.user.firstName ?? req.user.username} would like to become your therapist. Review this in Settings.`,
      { therapistId: req.user.id },
    );

    res.status(200).json({
      message: "Request sent — the client needs to accept it before you can access their account.",
      client: { _id: user._id, username: user.username, firstName: user.firstName, lastName: user.lastName, avatar: user.avatar },
    });
  } catch (error) {
    throw error;
  }
};

// User approves or rejects a pending therapist connection request.
export const respondTherapistRequest = async (req, res) => {
  try {
    const { action } = req.body;
    const user = await User.findById(req.user.id);
    if (!user.pendingTherapistRequest) {
      return res.status(404).json({ error: { message: "No pending therapist request.", code: "NOT_FOUND", category: "USER" } });
    }

    const therapistId = user.pendingTherapistRequest;
    user.pendingTherapistRequest = null;
    if (action === "approve") {
      user.therapist = therapistId;
    }
    await user.save();

    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: action === "approve" ? "therapist_request_approved" : "therapist_request_rejected",
      targetType: "user",
      target: therapistId,
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });

    if (action === "approve") {
      await createNotification(
        therapistId,
        "system",
        "Client request accepted",
        `${user.firstName ?? user.username} accepted your therapist connection request.`,
        { userId: user._id },
      );
    }

    res.status(200).json({
      message: action === "approve" ? "Therapist connected." : "Request declined.",
    });
  } catch (error) {
    throw error;
  }
};

// Admin assigns (or removes) a therapist for a user
export const assignTherapist = async (req, res) => {
  try {
    const { userId, therapistId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND", category: "USER" } });
    }

    if (therapistId) {
      const therapist = await User.findById(therapistId);
      if (!therapist || therapist.role !== "therapist") {
        return res.status(400).json({ error: { message: "Invalid therapist.", code: "VALIDATION_ERROR", category: "USER" } });
      }
      user.therapist = therapistId;
    } else {
      user.therapist = null;
    }

    await user.save();
    res.status(200).json({ message: "Therapist assignment updated.", user: { _id: user._id, therapist: user.therapist } });
  } catch (error) {
    throw error;
  }
};
