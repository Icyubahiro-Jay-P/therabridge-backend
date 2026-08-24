import User from "../models/user.model.js";
import { Message, Community } from "../models/chat.model.js";
import Mood from "../models/mood.model.js";
import Crisis from "../models/crisis.model.js";
import { TherryMessage } from "../models/therryMessage.model.js";
import Notification from "../models/notification.model.js";
import ExerciseLog from "../models/exerciseLog.model.js";
import PushSubscription from "../models/pushSubscription.model.js";
import SafetyPlan from "../models/safetyPlan.model.js";
import ThoughtRecord from "../models/thoughtRecord.model.js";
import Assessment from "../models/assessment.model.js";
import GratitudeEntry from "../models/gratitude.model.js";
import Activity from "../models/activity.model.js";
import CopingCard from "../models/copingCard.model.js";
import { PsychoedProgress } from "../models/psychoedModule.model.js";
import { Program, UserProgress } from "../models/program.model.js";
import { SleepLog } from "../models/sleep.model.js";
import { Medication, MedicationLog } from "../models/medication.model.js";
import Pet from "../models/pet.model.js";
import JournalEntry from "../models/journal.model.js";
import { Habit, HabitLog } from "../models/habit.model.js";
import { deleteUserAndData } from "../services/deletion.service.js";
import { decryptField } from "../utils/crypto.js";
import { clearAuthCookies } from "../utils/tokens.js";
import { logAccess, ipFromReq, uaFromReq } from "../services/audit.service.js";

export const deleteProfile = async (req, res) => {
  try {
    // prompt a user to confirm deletion by rewriting their username in the request body
    const { username } = req.body;
    const currentUser = await User.findById(req.user.id);

    if (username !== currentUser.username) {
      return res.status(400).json({
        message: "Username does not match. Please confirm deletion.",
      });
    } else {
      await deleteUserAndData(req.user.id);
      await logAccess({
        actor: req.user.id,
        actorRole: req.user.role,
        action: "account_deletion",
        targetType: "user",
        target: req.user.id,
        detail: { selfService: true },
        ip: ipFromReq(req),
        userAgent: uaFromReq(req),
      });
      clearAuthCookies(res);
      res.status(200).json({ message: "User deleted successfully" });
    }
  } catch (error) {
    throw error;
  }
};

export const updatePrivacy = async (req, res) => {
  try {
    const { privacySettings } = req.body;
    const allowedFields = [
      "firstName",
      "lastName",
      "email",
      "dateOfBirth",
      "bio",
    ];

    const updates = {};
    let privateCount = 0;

    for (const field of allowedFields) {
      if (privacySettings[field] !== undefined) {
        if (!["public", "private"].includes(privacySettings[field])) {
          return res
            .status(400)
            .json({ error: { message: `Invalid value for ${field}.`, code: "VALIDATION_ERROR" } });
        }
        updates[`privacySettings.${field}`] = privacySettings[field];
        if (privacySettings[field] === "private") privateCount++;
      }
    }

    if (privateCount > 3) {
      return res
        .status(400)
        .json({ error: { message: "You can hide at most 3 profile fields.", code: "VALIDATION_ERROR" } });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true },
    ).select("-password -oldPasswords -refreshTokens -verificationCode -verificationCodeExpire");

    res.status(200).json({
      message: "Privacy settings updated",
      privacySettings: user.privacySettings,
    });
  } catch (error) {
    throw error;
  }
};

// Records the user's acknowledgement that Therry is an AI companion, not a
// licensed therapist. Persistent (unlike the per-session banner).
export const acknowledgeAiDisclosure = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { aiDisclosureAcknowledgedAt: new Date() } },
      { new: true },
    ).select("aiDisclosureAcknowledgedAt");
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND", category: "USER" } });
    }
    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: "ai_disclosure_ack",
      targetType: "user",
      target: req.user.id,
      detail: { acknowledgedAt: user.aiDisclosureAcknowledgedAt },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });
    res.status(200).json({ acknowledgedAt: user.aiDisclosureAcknowledgedAt });
  } catch (error) {
    throw error;
  }
};

// Returns a JSON bundle of every piece of data the platform holds about the
// requesting user (GDPR-style data portability). Encrypted fields are
// decrypted so the export is human-readable.
export const exportMyData = async (req, res) => {
  try {
    const userId = req.user.id;

    const [
      user,
      moods,
      crises,
      therryMessages,
      notifications,
      messages,
      communities,
      exerciseLogs,
      pushSubscriptions,
      safetyPlan,
    ] = await Promise.all([
      User.findById(userId).select(
        "-password -oldPasswords -resetPasswordToken -resetPasswordExpire -refreshTokens -verificationCode -verificationCodeExpire",
      ),
      Mood.find({ user: userId }).sort({ createdAt: 1 }).lean(),
      Crisis.find({ user: userId }).sort({ createdAt: 1 }).lean(),
      TherryMessage.find({ user: userId }).sort({ createdAt: 1 }).lean(),
      Notification.find({ recipient: userId }).sort({ createdAt: 1 }).lean(),
      Message.find({
        $or: [{ sender: userId }, { recipient: userId }],
      }).sort({ createdAt: 1 }).lean(),
      Community.find({
        $or: [{ owner: userId }, { members: userId }],
      }).sort({ createdAt: 1 }).lean(),
      ExerciseLog.find({ user: userId }).sort({ createdAt: 1 }).lean(),
      PushSubscription.find({ user: userId }).sort({ createdAt: 1 }).lean(),
      SafetyPlan.findOne({ user: userId }).lean(),
    ]);

    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND", category: "USER" } });
    }

    const exportedAt = new Date().toISOString();
    const data = {
      exportedAt,
      platform: "Therabridge",
      user: user.toObject(),
      messages: messages.map((m) => ({ ...m, content: decryptField(m.content) })),
      communities: communities.map((c) => ({
        ...c,
        messages: (c.messages || []).map((msg) => ({
          ...msg,
          content: decryptField(msg.content),
        })),
      })),
      moods: moods.map((m) => ({ ...m, note: decryptField(m.note) })),
      crises: crises.map((c) => ({ ...c, description: decryptField(c.description) })),
      therryMessages: therryMessages.map((t) => ({
        ...t,
        content: decryptField(t.content),
      })),
      notifications: notifications.map((n) => ({
        ...n,
        body: decryptField(n.body),
      })),
      exerciseLogs,
      pushSubscriptions,
      safetyPlan: safetyPlan
        ? {
            ...safetyPlan,
            warningSigns: (safetyPlan.warningSigns || []).map(decryptField),
            internalCoping: (safetyPlan.internalCoping || []).map(decryptField),
            distractionPeople: (safetyPlan.distractionPeople || []).map(decryptField),
            distractionSettings: (safetyPlan.distractionSettings || []).map(decryptField),
            helpPeople: (safetyPlan.helpPeople || []).map(decryptField),
            professionals: (safetyPlan.professionals || []).map(decryptField),
            meansRestriction: (safetyPlan.meansRestriction || []).map(decryptField),
            reasonsForLiving: (safetyPlan.reasonsForLiving || []).map(decryptField),
          }
        : null,
      recordCounts: {
        messages: messages.length,
        communities: communities.length,
        moods: moods.length,
        crises: crises.length,
        therryMessages: therryMessages.length,
        notifications: notifications.length,
        exerciseLogs: exerciseLogs.length,
        pushSubscriptions: pushSubscriptions.length,
        safetyPlan: safetyPlan ? 1 : 0,
      },
    };

    await logAccess({
      actor: userId,
      actorRole: req.user.role,
      action: "data_export",
      targetType: "user",
      target: userId,
      detail: { exportedAt, recordCounts: data.recordCounts },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });

    res.set(
      "Content-Disposition",
      `attachment; filename="therabridge-data-${userId}.json"`,
    );
    res.status(200).json(data);
  } catch (error) {
    throw error;
  }
};
