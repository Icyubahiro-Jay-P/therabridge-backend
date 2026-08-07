import User from "../models/user.model.js";

// Talking Points - "reaching out is cardio for the heart."
// Every message is a small wellness exercise, so it feeds the same score
// that guided exercises do.
export const MESSAGE_POINTS = {
  direct: 2, // DM sent
  community: 2, // community message sent
  therry: 5, // opening up to Therry (bonus self-care)
};

// Cap per user per day so chat can't outpace real self-care. Mirrors the
// "Talking Points" design in the README.
export const DAILY_POINTS_CAP = 20;

export const awardMessagePoints = async (userId, points, session = null) => {
  const user = await User.findById(userId, null, session ? { session } : null);
  if (!user) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const counterDate = user.talkingPointsDate
    ? new Date(user.talkingPointsDate)
    : null;
  if (counterDate) counterDate.setHours(0, 0, 0, 0);

  if (!counterDate || counterDate.getTime() !== today.getTime()) {
    user.talkingPointsToday = 0;
    user.talkingPointsDate = today;
  }

  if (user.talkingPointsToday >= DAILY_POINTS_CAP) {
    await user.save({ session });
    return 0;
  }

  const awarded = Math.min(points, DAILY_POINTS_CAP - user.talkingPointsToday);
  user.talkingPointsToday += awarded;
  user.exerciseScore = (user.exerciseScore || 0) + awarded;
  await user.save({ session });

  return awarded;
};
