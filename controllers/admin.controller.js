import User from "../models/user.model.js";
import { Message, Community } from "../models/chat.model.js";
import Mood from "../models/mood.model.js";
import Crisis from "../models/crisis.model.js";
import ExerciseLog from "../models/exerciseLog.model.js";
import Notification from "../models/notification.model.js";
import AuditLog from "../models/auditLog.model.js";

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

// Groups documents by calendar day (YYYY-MM-DD) into a Map keyed by date string.
const aggregateDaily = async (Model, dateField, days, extraMatch = {}) => {
  const rows = await Model.aggregate([
    { $match: { ...extraMatch, [dateField]: { $gte: daysAgo(days) } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: dateField } },
        count: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, r.count]));
};

// Community messages are embedded subdocuments on the Community document, so
// daily counting requires an unwind. Returns a Map keyed by day string.
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

// Admin-only platform overview. Aggregates live counts, 7/30-day trends, a
// 14-day activity series, mood distribution, and the feeds shown on the
// dashboard (recent signups, active crises, top communities, audit activity).
export const getDashboard = async (req, res) => {
  try {
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
      // Community messages are embedded subdocs, so they need an unwind.
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

    res.status(200).json({
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
    });
  } catch (error) {
    throw error;
  }
};
