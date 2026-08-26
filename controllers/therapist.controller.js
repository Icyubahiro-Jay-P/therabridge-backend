import User from "../models/user.model.js";
import Mood from "../models/mood.model.js";
import Crisis from "../models/crisis.model.js";
import ExerciseLog from "../models/exerciseLog.model.js";
import { logAccess, ipFromReq, uaFromReq } from "../services/audit.service.js";
import { cacheGet, cacheSet } from "../services/cache.js";

const DAY_MS = 86400000;
const MOOD_SCORE = { great: 5, good: 4, okay: 3, bad: 2, terrible: 1 };
const NEGATIVE_MOODS = ["bad", "terrible"];

const LOOKBACK = {
  moodDays: 14,
  crisisDays: 7,
  exerciseDays: 14,
  severeHours: 24,
};

// Per-client "signals to check in on" aggregated from existing mood, crisis,
// exercise, and login data (B3). Deliberately framed as signals, not a
// diagnosis: the output is transparent, threshold-based reasons a therapist
// can use as a conversation starter.
const computeClientRisk = ({ client, moods, crises, exerciseLogs, now }) => {
  const moodWindowStart = new Date(now.getTime() - LOOKBACK.moodDays * DAY_MS);
  const crisisWindowStart = new Date(now.getTime() - LOOKBACK.crisisDays * DAY_MS);
  const exerciseWindowStart = new Date(now.getTime() - LOOKBACK.exerciseDays * DAY_MS);
  const severeWindowStart = new Date(now.getTime() - LOOKBACK.severeHours * 3600000);

  const userMoods = moods
    .filter((m) => m.user && m.user.toString() === client._id.toString())
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const negativeLast7d = userMoods.filter(
    (m) =>
      NEGATIVE_MOODS.includes(m.mood) &&
      new Date(m.date) >= crisisWindowStart,
  ).length;

  let trend = "stable";
  const midpoint = new Date((now.getTime() + moodWindowStart.getTime()) / 2);
  const older = userMoods.filter((m) => new Date(m.date) < midpoint);
  const newer = userMoods.filter((m) => new Date(m.date) >= midpoint);
  const avg = (list) =>
    list.length === 0 ? null : list.reduce((s, m) => s + (MOOD_SCORE[m.mood] ?? 3), 0) / list.length;
  const olderAvg = avg(older);
  const newerAvg = avg(newer);
  if (olderAvg !== null && newerAvg !== null) {
    if (newerAvg < olderAvg - 0.5) trend = "declining";
    else if (newerAvg > olderAvg + 0.5) trend = "improving";
  }

  const lastMood = userMoods.length > 0 ? userMoods[userMoods.length - 1].mood : null;

  const userCrises = crises
    .filter((c) => c.user && c.user.toString() === client._id.toString())
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const severeLast24h = userCrises.some(
    (c) => c.severity === "severe" && new Date(c.createdAt) >= severeWindowStart,
  );
  const lastCrisis = userCrises[userCrises.length - 1] || null;

  const userExercises = exerciseLogs.filter(
    (e) => e.user && e.user.toString() === client._id.toString(),
  );
  const completedLast14d = userExercises.length;
  const lastCompletedAt =
    userExercises.length > 0
      ? userExercises[userExercises.length - 1].completedAt
      : null;

  const lastLogin = client.lastLoginDate ? new Date(client.lastLoginDate) : null;
  const daysSinceLastLogin = lastLogin
    ? Math.floor((now.getTime() - new Date(lastLogin).getTime()) / DAY_MS)
    : null;

  const signals = {
    mood: { negativeLast7d, lastMood, trend },
    crisis: {
      recentAlerts7d: userCrises.length,
      lastAlertType: lastCrisis?.alertType ?? null,
      lastSeverity: lastCrisis?.severity ?? null,
      severeLast24h,
    },
    exercise: { completedLast14d, lastCompletedAt },
    login: { daysSinceLastLogin, loginStreak: client.loginStreak ?? 0 },
  };

  const reasons = [];
  if (severeLast24h) {
    reasons.push("Severe crisis alert in the last 24 hours");
  } else if (userCrises.length > 0) {
    reasons.push(`${userCrises.length} crisis alert(s) in the last 7 days`);
  }
  if (negativeLast7d >= 2) {
    reasons.push(`${negativeLast7d} low moods in the last 7 days`);
  } else if (negativeLast7d >= 1 && trend === "declining") {
    reasons.push("Mood trend declining over the last 14 days");
  }
  if (completedLast14d === 0) {
    reasons.push("No exercises completed in the last 14 days");
  }
  if (daysSinceLastLogin !== null && daysSinceLastLogin >= 7) {
    reasons.push(`No login in ${daysSinceLastLogin} days`);
  }

  let signalLevel = "low";
  if (
    severeLast24h ||
    negativeLast7d >= 4 ||
    (negativeLast7d >= 2 && trend === "declining")
  ) {
    signalLevel = "high";
  } else if (
    userCrises.length > 0 ||
    negativeLast7d >= 2 ||
    completedLast14d === 0 ||
    (daysSinceLastLogin !== null && daysSinceLastLogin >= 7) ||
    (negativeLast7d >= 1 && trend === "declining")
  ) {
    signalLevel = "medium";
  }

  return {
    userId: client._id,
    firstName: client.firstName,
    lastName: client.lastName,
    username: client.username,
    signalLevel,
    reasons,
    signals,
  };
};

// GET /api/therapist/clients/risk-summary - one aggregate per client on the
// therapist's roster. Read-only and audit-logged.
export const getClientsRiskSummary = async (req, res) => {
  try {
    const cacheKey = `therapist:risk:${req.user.id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const now = new Date();
    const moodWindowStart = new Date(now.getTime() - LOOKBACK.moodDays * DAY_MS);
    const crisisWindowStart = new Date(now.getTime() - LOOKBACK.crisisDays * DAY_MS);
    const exerciseWindowStart = new Date(now.getTime() - LOOKBACK.exerciseDays * DAY_MS);

    const clients = await User.find({ therapist: req.user.id })
      .select("_id firstName lastName username lastLoginDate loginStreak")
      .lean();

    const ids = clients.map((c) => c._id);
    const [moods, crises, exerciseLogs] = await Promise.all([
      Mood.find({ user: { $in: ids }, date: { $gte: moodWindowStart } })
        .select("user mood date")
        .lean(),
      Crisis.find({ user: { $in: ids }, createdAt: { $gte: crisisWindowStart } })
        .select("user alertType severity status createdAt")
        .lean(),
      ExerciseLog.find({
        user: { $in: ids },
        completed: true,
        completedAt: { $gte: exerciseWindowStart },
      })
        .select("user completedAt")
        .lean(),
    ]);

    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: "risk_summary_view",
      targetType: "user",
      detail: { rosterCount: clients.length },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });

    const summaries = clients.map((client) =>
      computeClientRisk({ client, moods, crises, exerciseLogs, now }),
    );

    res.status(200).json({ clients: summaries });
  } catch (error) {
    throw error;
  }
};
