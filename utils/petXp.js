import Pet from "../models/pet.model.js";
import logger from "./logger.js";

const XP_PER_LEVEL = 100;

// Server-side pet XP award so wellness features can reinforce the companion
// without depending on the client to call /api/pet/activity. Best-effort by
// design: a pet problem must never fail the underlying wellness action, so
// errors are logged and swallowed.
export const awardPetXp = async (userId, amount) => {
  try {
    let pet = await Pet.findOne({ user: userId });
    if (!pet) {
      pet = await Pet.create({ user: userId, name: "Sage" });
    }

    pet.experience += amount;
    let leveledUp = false;
    while (pet.experience >= pet.level * XP_PER_LEVEL) {
      pet.experience -= pet.level * XP_PER_LEVEL;
      pet.level += 1;
      leveledUp = true;
    }
    await pet.save();

    return { leveledUp, level: pet.level };
  } catch (err) {
    logger.error({ err }, "Failed to award pet XP");
    return { leveledUp: false, level: null };
  }
};
