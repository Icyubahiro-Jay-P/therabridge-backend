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
import { withTransaction } from "../utils/transactions.js";
import { deleteAvatarFromCloudinary } from "../utils/cloudinary.js";
import logger from "../utils/logger.js";

const deleteAvatarFile = async (avatar, userId) => {
  if (!avatar || !userId) return;
  try {
    await deleteAvatarFromCloudinary(userId);
  } catch (error) {
    logger.error({ err: error }, "Failed to delete avatar file");
  }
};

// Permanently removes every piece of data belonging to a user. Used by both
// self-service account deletion and admin deletion. The audit trail is kept
// for accountability but the user's identity is nulled out of it.
// Runs inside a multi-document transaction so a crash mid-way can't leave a
// user's data half-deleted (a GDPR problem) or their account gone while
// orphaned records remain.
export const deleteUserAndData = async (userId) => {
  return withTransaction(async (session) => {
    const opts = session ? { session } : undefined;
    const user = await User.findById(userId, null, opts);
    if (user) {
      await deleteAvatarFile(user.avatar, userId);
    }

    // Communities owned by the user are deleted outright.
    await Community.deleteMany({ owner: userId }, opts);
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
      opts,
    );

    // Direct messages, mood logs, crisis records, Therry history, notifications,
    // exercise history, and push subscriptions.
    await Message.deleteMany(
      { $or: [{ sender: userId }, { recipient: userId }] },
      opts,
    );
    await Mood.deleteMany({ user: userId }, opts);
    await Crisis.deleteMany({ user: userId }, opts);
    await CrisisLog.deleteMany({ user: userId }, opts);
    await TherryMessage.deleteMany({ user: userId }, opts);
    await Notification.deleteMany({ recipient: userId }, opts);
    await ExerciseLog.deleteMany({ user: userId }, opts);
    await PushSubscription.deleteMany({ user: userId }, opts);
    await SafetyPlan.deleteMany({ user: userId }, opts);

    // Wellness tool data (thought records, assessments, gratitude, activities,
    // coping cards, psychoeducation + program progress, sleep, medications,
    // pet, journal, habits).
    await ThoughtRecord.deleteMany({ user: userId }, opts);
    await Assessment.deleteMany({ user: userId }, opts);
    await GratitudeEntry.deleteMany({ user: userId }, opts);
    await Activity.deleteMany({ user: userId }, opts);
    await CopingCard.deleteMany({ user: userId }, opts);
    await PsychoedProgress.deleteMany({ user: userId }, opts);
    await UserProgress.deleteMany({ user: userId }, opts);
    await SleepLog.deleteMany({ user: userId }, opts);
    await MedicationLog.deleteMany({ user: userId }, opts);
    await Medication.deleteMany({ user: userId }, opts);
    await Pet.deleteMany({ user: userId }, opts);
    await JournalEntry.deleteMany({ user: userId }, opts);
    await HabitLog.deleteMany({ user: userId }, opts);
    await Habit.deleteMany({ user: userId }, opts);

    // Keep the audit trail, but strip the identity from it.
    await AuditLog.updateMany(
      { actor: userId },
      { $set: { actor: null, detail: { ...{}, anonymized: true } } },
      opts,
    );
    await AuditLog.updateMany(
      { target: userId },
      { $set: { target: null, detail: { anonymized: true } } },
      opts,
    );

    await User.findByIdAndDelete(userId, opts);
  });
};
