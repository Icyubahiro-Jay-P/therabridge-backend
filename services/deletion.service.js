import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import User from "../models/user.model.js";
import { Message, Community } from "../models/chat.model.js";
import Mood from "../models/mood.model.js";
import Crisis from "../models/crisis.model.js";
import CrisisLog from "../models/crisisLog.model.js";
import { TherryMessage } from "../models/therryMessage.model.js";
import Notification from "../models/notification.model.js";
import ExerciseLog from "../models/exerciseLog.model.js";
import PushSubscription from "../models/pushSubscription.model.js";
import SafetyPlan from "../models/safetyPlan.model.js";
import AuditLog from "../models/auditLog.model.js";
import { withTransaction } from "../utils/transactions.js";
import logger from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const deleteAvatarFile = async (avatar) => {
  if (!avatar || !avatar.startsWith("/uploads/")) return;
  try {
    const resolvedPath = path.resolve(path.join(__dirname, "..", avatar));
    const uploadsDir = path.resolve(path.join(__dirname, "..", "uploads"));
    if (resolvedPath.startsWith(uploadsDir) && fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to delete avatar file");
  }
};

// Permanently removes every piece of data belonging to a user. Used by both
// self-service account deletion and admin deletion. The audit trail is kept
// for accountability but the user's identity is nulled out of it.
export const deleteUserAndData = async (userId) => {
  const user = await User.findById(userId);
  if (user) {
    await deleteAvatarFile(user.avatar);
  }

  // Communities owned by the user are deleted outright.
  await Community.deleteMany({ owner: userId });
  // Pull the user from any other community and drop their messages there.
  await Community.updateMany(
    { members: userId },
    {
      $pull: {
        members: userId,
        moderators: userId,
        pendingMembers: userId,
        messages: { sender: userId },
      },
    },
  );

  // Direct messages, mood logs, crisis records, Therry history, notifications,
  // exercise history, and push subscriptions.
  await Message.deleteMany({
    $or: [{ sender: userId }, { recipient: userId }],
  });
  await Mood.deleteMany({ user: userId });
  await Crisis.deleteMany({ user: userId });
  await CrisisLog.deleteMany({ user: userId });
  await TherryMessage.deleteMany({ user: userId });
  await Notification.deleteMany({ recipient: userId });
  await ExerciseLog.deleteMany({ user: userId });
  await PushSubscription.deleteMany({ user: userId });
  await SafetyPlan.deleteMany({ user: userId });

  // Keep the audit trail, but strip the identity from it.
  await AuditLog.updateMany(
    { actor: userId },
    { $set: { actor: null, detail: { ...{}, anonymized: true } } },
  );
  await AuditLog.updateMany(
    { target: userId },
    { $set: { target: null, detail: { anonymized: true } } },
  );

  await User.findByIdAndDelete(userId);
};
