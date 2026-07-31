import User from "../models/user.model.js";

// Talking Points — "reaching out is cardio for the heart."
// Every message is a small wellness exercise, so it feeds the same score
// that guided exercises do.
export const MESSAGE_POINTS = {
  direct: 2, // DM sent
  community: 2, // community message sent
  therry: 5, // opening up to Therry (bonus self-care)
};

export const awardMessagePoints = async (userId, points) => {
  const user = await User.findById(userId);
  if (!user) return 0;

  user.exerciseScore = (user.exerciseScore || 0) + points;
  await user.save();

  return points;
};
