import User from "../models/user.model.js";
import { logAccess, ipFromReq, uaFromReq } from "../services/audit.service.js";

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

// Therapist adds a regular user to their roster (establishes the management link)
export const addTherapistClient = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (user.role !== "user") {
      return res.status(400).json({ message: "Only regular users can be added as clients." });
    }
    if (user.therapist && user.therapist.toString() !== req.user.id) {
      return res.status(409).json({ message: "This user already has a therapist." });
    }

    user.therapist = req.user.id;
    await user.save();

    res.status(200).json({
      message: "Client added to your roster.",
      client: { _id: user._id, username: user.username, firstName: user.firstName, lastName: user.lastName, avatar: user.avatar },
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
      return res.status(404).json({ message: "User not found." });
    }

    if (therapistId) {
      const therapist = await User.findById(therapistId);
      if (!therapist || therapist.role !== "therapist") {
        return res.status(400).json({ message: "Invalid therapist." });
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
