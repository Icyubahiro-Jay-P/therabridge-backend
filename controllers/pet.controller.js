import Pet from "../models/pet.model.js";

const ADVENTURE_TEXTS = [
  "Sage flew to a meadow of wildflowers and brought back a feather of courage.",
  "Sage discovered a hidden waterfall and learned that patience reveals beauty.",
  "Sage met a wise old owl who shared the secret of inner peace.",
  "Sage found a shimmering river and watched the sunset in golden light.",
  "Sage climbed a mountain peak and saw the world from a new perspective.",
  "Sage sheltered a small butterfly during a rainstorm and felt the warmth of kindness.",
  "Sage explored an ancient forest and found a clearing full of starlight.",
  "Sage rested by a warm campfire and listened to the songs of crickets.",
  "Sage flew over the ocean and felt the vastness of the world.",
  "Sage discovered a garden of glowing flowers and danced in the moonlight.",
  "Sage found a treasure chest of memories and relived a joyful moment.",
  "Sage painted the sky with colors of hope at dawn.",
];

const XP_PER_LEVEL = 100;
const ADVENTURE_INTERVAL_DAYS = 3;

function xpForNextLevel(level) {
  return level * XP_PER_LEVEL;
}

function computeMood(pet, lastActivityDate) {
  if (!lastActivityDate) return "neutral";
  const daysSince = (Date.now() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 1) return "happy";
  if (daysSince <= 3) return "content";
  return "sad";
}

export const getMyPet = async (req, res) => {
  try {
    let pet = await Pet.findOne({ user: req.user.id });
    if (!pet) {
      pet = await Pet.create({
        user: req.user.id,
        name: "Sage",
        level: 1,
        experience: 0,
        mood: "content",
        hunger: 50,
      });
    }
    res.status(200).json(pet);
  } catch (error) {
    throw error;
  }
};

export const feedPet = async (req, res) => {
  try {
    const pet = await Pet.findOne({ user: req.user.id });
    if (!pet) {
      return res.status(404).json({ error: { message: "Pet not found.", code: "NOT_FOUND" } });
    }

    const now = new Date();
    if (pet.lastFedAt) {
      const hoursSince = (now - new Date(pet.lastFedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 1) {
        // A full pet is a normal game state, not an error - tell the user
        // warmly and let them retry later.
        return res.status(200).json({ fed: false, pet, leveledUp: false, message: `${pet.name} is still full! Try again in a little while.` });
      }
    }

    pet.experience += 5;
    pet.hunger = 0;
    pet.lastFedAt = now;
    pet.mood = "happy";

    let leveledUp = false;
    while (pet.experience >= xpForNextLevel(pet.level)) {
      pet.experience -= xpForNextLevel(pet.level);
      pet.level += 1;
      leveledUp = true;
    }

    await pet.save();
    res.status(200).json({ fed: true, pet, leveledUp, message: `${pet.name} gobbled up the treat! +5 XP` });
  } catch (error) {
    throw error;
  }
};

export const renamePet = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0 || name.length > 30) {
      return res.status(400).json({ error: { message: "Name must be 1-30 characters.", code: "VALIDATION_ERROR" } });
    }
    const pet = await Pet.findOneAndUpdate(
      { user: req.user.id },
      { name: name.trim() },
      { new: true }
    );
    if (!pet) {
      return res.status(404).json({ error: { message: "Pet not found.", code: "NOT_FOUND" } });
    }
    res.status(200).json(pet);
  } catch (error) {
    throw error;
  }
};

export const getAdventures = async (req, res) => {
  try {
    const pet = await Pet.findOne({ user: req.user.id });
    if (!pet) {
      return res.status(404).json({ error: { message: "Pet not found.", code: "NOT_FOUND" } });
    }
    res.status(200).json({ adventures: pet.adventureLog });
  } catch (error) {
    throw error;
  }
};

export const checkActivity = async (req, res) => {
  try {
    const { activityType } = req.body;
    const xpMap = {
      exercise: 10,
      mood_log: 5,
      gratitude: 5,
      assessment: 8,
      thought_record: 8,
      medication_log: 5,
    };
    const xpGain = xpMap[activityType] || 5;

    let pet = await Pet.findOne({ user: req.user.id });
    if (!pet) {
      pet = await Pet.create({ user: req.user.id, name: "Sage" });
    }

    pet.experience += xpGain;
    const now = new Date();

    let leveledUp = false;
    while (pet.experience >= xpForNextLevel(pet.level)) {
      pet.experience -= xpForNextLevel(pet.level);
      pet.level += 1;
      leveledUp = true;
    }

    pet.mood = computeMood(pet, now);

    let adventureTriggered = false;
    let adventureText = null;
    const recentAdventures = pet.adventureLog.filter(
      (a) => (now - new Date(a.date).getTime()) / (1000 * 60 * 60 * 24) < ADVENTURE_INTERVAL_DAYS
    );
    if (recentAdventures.length === 0 && pet.level > 1) {
      adventureText = ADVENTURE_TEXTS[Math.floor(Math.random() * ADVENTURE_TEXTS.length)];
      pet.adventureLog.push({ text: adventureText, date: now });
      adventureTriggered = true;
    }

    await pet.save();
    res.status(200).json({
      pet,
      xpGain,
      leveledUp,
      adventureTriggered,
      adventureText,
      message: leveledUp ? `${pet.name} leveled up to level ${pet.level}!` : `+${xpGain} XP`,
    });
  } catch (error) {
    throw error;
  }
};
