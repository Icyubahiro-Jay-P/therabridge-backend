import User from "../models/user.model.js";

// Talking Points — "reaching out is cardio for the heart."
// Every message is a small wellness exercise, so it feeds the same score
// that guided exercises do. Points are capped per day so grinding chat
// can't outpace actual self-care.
export const MESSAGE_POINTS = {
  direct: 2, // DM sent
  community: 2, // community message sent
  therry: 5, // opening up to Therry (bonus self-care)
};

export const DAILY_MESSAGE_POINT_CAP = 20;

export const awardMessagePoints = async (userId, points) => {
  const user = await User.findById(userId);
  if (!user) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (
    !user.messagePointsDate ||
    new Date(user.messagePointsDate).getTime() !== today.getTime()
  ) {
    user.messagePointsDate = today;
    user.messagePointsToday = 0;
  }

  const remaining = DAILY_MESSAGE_POINT_CAP - (user.messagePointsToday || 0);
  const awarded = Math.max(0, Math.min(points, remaining));
  if (awarded === 0) return 0;

  user.messagePointsToday = (user.messagePointsToday || 0) + awarded;
  user.exerciseScore = (user.exerciseScore || 0) + awarded;
  await user.save();

  return awarded;
};
