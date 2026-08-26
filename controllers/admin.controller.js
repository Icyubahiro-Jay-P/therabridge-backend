import User from "../models/user.model.js";
import { Message, Community } from "../models/chat.model.js";
import Mood from "../models/mood.model.js";
import Crisis from "../models/crisis.model.js";
import ExerciseLog from "../models/exerciseLog.model.js";
import Notification from "../models/notification.model.js";
import AuditLog from "../models/auditLog.model.js";
import { deleteUserAndData } from "../services/deletion.service.js";
import { logAccess, ipFromReq, uaFromReq } from "../services/audit.service.js";
import { cacheGet, cacheSet, cacheDelPattern } from "../services/cache.js";

const daysAgo = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const aggregateDaily = async (Model, dateField, days, extraMatch = {}) => {
  const rows = await Model.aggregate([
    { $match: { ...extraMatch, [dateField]: { $gte: daysAgo(days) } } },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$" + dateField },
        },
        count: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, r.count]));
};

const aggregateCommunityMessagesDaily = async (days) => {
  const rows = await Community.aggregate([
    { $match: { "messages.createdAt": { $gte: daysAgo(days) } } },
    { $unwind: "$messages" },
    { $match: { "messages.createdAt": { $gte: daysAgo(days) } } },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$messages.createdAt" },
        },
        count: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, r.count]));
};

const buildDailySeries = (maps, days) => {
  const labels = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push({
      date: key,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      messages: maps.messages?.get(key) ?? 0,
      communityMessages: maps.communityMessages?.get(key) ?? 0,
      moods: maps.moods?.get(key) ?? 0,
      exercises: maps.exercises?.get(key) ?? 0,
      crises: maps.crises?.get(key) ?? 0,
      signups: maps.signups?.get(key) ?? 0,
    });
  }
  return labels;
};

const countSince = (Model, filter, since) =>
  Model.countDocuments({ ...filter, createdAt: { $gte: since } });

// ====================== ADMIN & THERAPIST FEATURES ======================

export const disableUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND", category: "USER" } });
    }
    if (user.role === "admin") {
      return res.status(400).json({ error: { message: "Cannot disable another admin.", code: "VALIDATION_ERROR", category: "USER" } });
    }
    user.isDisabled = !user.isDisabled;
    await user.save();
    res.status(200).json({
      message: `User ${user.isDisabled ? "disabled" : "enabled"} successfully.`,
      user: {
        _id: user._id,
        isDisabled: user.isDisabled,
        username: user.username,
      },
    });
  } catch (error) {
    throw error;
  }
};

export const changeUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!["user", "therapist", "admin"].includes(role)) {
      return res.status(400).json({ error: { message: "Invalid role.", code: "VALIDATION_ERROR", category: "USER" } });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND", category: "USER" } });
    }
    user.role = role;
    await user.save();
    res.status(200).json({
      message: `User role updated to ${role}.`,
      user: { _id: user._id, username: user.username, role: user.role },
    });
  } catch (error) {
    throw error;
  }
};

export const deleteUserByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND", category: "USER" } });
    }
    if (user.role === "admin") {
      return res.status(400).json({ error: { message: "Cannot delete another admin.", code: "VALIDATION_ERROR", category: "USER" } });
    }

    await deleteUserAndData(id);
    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: "account_deletion",
      targetType: "user",
      target: id,
      detail: { selfService: false },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });
    res.status(200).json({ message: "User deleted by admin." });
  } catch (error) {
    throw error;
  }
};

export const getFullUserData = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    const user = await User.findById(id).select(
      "-password -oldPasswords -resetPasswordToken -resetPasswordExpire -refreshTokens -verificationCode -verificationCodeExpire",
    );
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND", category: "USER" } });
    }
    if (currentUser.role === "therapist") {
      if (user.role === "therapist" || user.role === "admin") {
        return res
          .status(403)
          .json({ error: { message: "Therapists can only view user profiles.", code: "FORBIDDEN", category: "USER" } });
      }
      if (!user.therapist || user.therapist.toString() !== currentUser.id) {
        return res
          .status(403)
          .json({ error: { message: "You can only view profiles of your assigned clients.", code: "FORBIDDEN", category: "USER" } });
      }
    }
    await logAccess({
      actor: currentUser.id,
      actorRole: currentUser.role,
      action: "user_profile_view",
      targetType: "user",
      target: id,
      detail: { scope: "full" },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });
    res.status(200).json(user);
  } catch (error) {
    throw error;
  }
};

// Admin-only platform overview.
export const getDashboard = async (req, res) => {
  try {
    const cacheKey = "admin:dashboard";
    const cached = await cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const week = daysAgo(7);
    const month = daysAgo(30);

    const [
      totalUsers,
      totalTherapists,
      totalAdmins,
      unverifiedUsers,
      disabledUsers,
      signupsWeek,
      signupsMonth,
      signupsToday,
      totalCommunities,
      communitiesWeek,
      activeCrisis,
      crisesWeek,
      crisesMonth,
      messagesWeek,
      communityMessagesWeek,
      moodsWeek,
      exercisesWeek,
      totalNotifications,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "therapist" }),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ isAccountVerified: false }),
      User.countDocuments({ isDisabled: true }),
      countSince(User, {}, week),
      countSince(User, {}, month),
      countSince(User, {}, startOfToday()),
      Community.countDocuments(),
      countSince(Community, {}, week),
      Crisis.countDocuments({ status: "active" }),
      countSince(Crisis, {}, week),
      countSince(Crisis, {}, month),
      countSince(Message, { kind: "message" }, week),
      await Community.aggregate([
        { $match: { "messages.createdAt": { $gte: week } } },
        { $unwind: "$messages" },
        { $match: { "messages.createdAt": { $gte: week } } },
        { $count: "count" },
      ]).then((rows) => rows[0]?.count ?? 0),
      countSince(Mood, {}, week),
      countSince(ExerciseLog, { completed: true }, week),
      Notification.countDocuments(),
    ]);

    const [
      dailyMessages,
      dailyCommunityMessages,
      dailyMoods,
      dailyExercises,
      dailyCrises,
      dailySignups,
      moodDistribution,
      recentSignups,
      activeCrises,
      recentAudit,
      topCommunities,
    ] = await Promise.all([
      aggregateDaily(Message, "createdAt", 14, { kind: "message" }),
      aggregateCommunityMessagesDaily(14),
      aggregateDaily(Mood, "createdAt", 14),
      aggregateDaily(ExerciseLog, "createdAt", 14, { completed: true }),
      aggregateDaily(Crisis, "createdAt", 14),
      aggregateDaily(User, "createdAt", 14),
      Mood.aggregate([
        { $match: { date: { $gte: month } } },
        { $group: { _id: "$mood", count: { $sum: 1 } } },
      ]),
      User.find()
        .sort({ createdAt: -1 })
        .limit(7)
        .select(
          "firstName lastName username email avatar role isAccountVerified isDisabled createdAt",
        )
        .lean(),
      Crisis.find({ status: "active" })
        .populate("user", "username firstName lastName avatar")
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
      AuditLog.find()
        .sort({ createdAt: -1 })
        .limit(6)
        .populate("actor", "username firstName lastName role")
        .populate("target", "username firstName lastName role")
        .lean(),
      Community.aggregate([
        {
          $addFields: {
            memberCount: { $size: { $ifNull: ["$members", []] } },
            messageCount: { $size: { $ifNull: ["$messages", []] } },
          },
        },
        { $sort: { memberCount: -1, messageCount: -1 } },
        { $limit: 5 },
        {
          $project: {
            name: 1,
            inviteKey: 1,
            category: 1,
            isPrivate: 1,
            createdAt: 1,
            memberCount: 1,
            messageCount: 1,
          },
        },
      ]),
    ]);

    const moodDist = { great: 0, good: 0, okay: 0, bad: 0, terrible: 0 };
    moodDistribution.forEach((row) => {
      if (moodDist[row._id] !== undefined) moodDist[row._id] = row.count;
    });

    const payload = {
      totals: {
        users: totalUsers,
        therapists: totalTherapists,
        admins: totalAdmins,
        communities: totalCommunities,
        activeCrisis: activeCrisis,
        unverifiedUsers: unverifiedUsers,
        disabledUsers: disabledUsers,
        notifications: totalNotifications,
      },
      trends: {
        signupsToday,
        signupsWeek,
        signupsMonth,
        communitiesWeek,
        crisesWeek,
        crisesMonth,
        messagesWeek,
        communityMessagesWeek,
        moodsWeek,
        exercisesWeek,
      },
      activity: buildDailySeries(
        {
          messages: dailyMessages,
          communityMessages: dailyCommunityMessages,
          moods: dailyMoods,
          exercises: dailyExercises,
          crises: dailyCrises,
          signups: dailySignups,
        },
        14,
      ),
      moodDistribution: moodDist,
      recentSignups,
      activeCrises,
      recentAudit,
      topCommunities,
    };

    await cacheSet(cacheKey, payload, 60);
    res.status(200).json(payload);
  } catch (error) {
    throw error;
  }
};
