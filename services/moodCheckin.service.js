import Mood from "../models/mood.model.js";
import Notification from "../models/notification.model.js";
import { TherryMessage } from "../models/therryMessage.model.js";
import { createNotification } from "./notification.service.js";
import { encryptField } from "../utils/crypto.js";
import logger from "../utils/logger.js";

const MOOD_SCORE = { great: 4, good: 3, okay: 2, bad: 1, terrible: 0 };

const BASELINE_WINDOW_DAYS = 14;
const CONSECUTIVE_THRESHOLD = 3;
const RATE_LIMIT_MS = 3 * 24 * 60 * 60 * 1000;

export const CHECKIN_TITLE = "Therry wants to check in";
export const CHECKIN_BODY =
  "I noticed the last few mood check-ins have been harder than usual. I'm here if you'd like to talk it through.";

// Pure decision logic (exported for tests). `entries` is any array of
// { mood, date } for a user's recent mood history. Returns the detected
// baseline + recent scores when the 3 most recent entries are all strictly
// below the user's 14-day baseline, otherwise null.
export const computeMoodCheckin = (entries) => {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
  if (sorted.length < CONSECUTIVE_THRESHOLD) return null;

  const newest = sorted[sorted.length - 1];
  const windowStart =
    new Date(newest.date).getTime() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const prior = sorted
    .slice(0, -1)
    .filter((e) => new Date(e.date).getTime() >= windowStart);

  const priorScores = prior.map((e) => MOOD_SCORE[e.mood]);
  if (
    prior.length < CONSECUTIVE_THRESHOLD ||
    priorScores.some((s) => s === undefined)
  ) {
    return null;
  }

  const baseline = priorScores.reduce((sum, s) => sum + s, 0) / priorScores.length;
  const recentScores = sorted
    .slice(-CONSECUTIVE_THRESHOLD)
    .map((e) => MOOD_SCORE[e.mood]);
  if (recentScores.some((s) => s === undefined)) return null;

  const allBelow = recentScores.every((s) => s < baseline);
  return allBelow ? { baseline, recentScores } : null;
};

// Fired after a mood entry is logged. Sends at most one mood check-in per user
// per 3 days (a Therry chat message + an in-app/push notification). Never
// throws - mood logging must keep working even if this fails.
export const maybeSendMoodCheckin = async (userId) => {
  try {
    const windowStart =
      Date.now() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const entries = await Mood.find({
      user: userId,
      date: { $gte: new Date(windowStart) },
    })
      .sort({ date: 1 })
      .select("mood date");

    const decision = computeMoodCheckin(
      entries.map((e) => ({ mood: e.mood, date: e.date }))
    );
    if (!decision) return null;

    const rateLimitStart = new Date(Date.now() - RATE_LIMIT_MS);
    const recent = await Notification.findOne({
      recipient: userId,
      type: "mood_checkin",
      createdAt: { $gte: rateLimitStart },
    }).select("_id");
    if (recent) return { skipped: "rate_limited" };

    await createNotification(
      userId,
      "mood_checkin",
      CHECKIN_TITLE,
      CHECKIN_BODY,
      { url: "/chat/therry" }
    );

    await TherryMessage.create({
      user: userId,
      role: "assistant",
      content: encryptField(
        "I noticed the last few mood check-ins have been harder than usual. I'm here if you'd like to talk it through - whenever you're ready."
      ),
      category: "checkin",
    });

    return { sent: true };
  } catch (error) {
    logger.error({ err: error }, "Mood check-in failed");
    return null;
  }
};
