import Mood from "../models/mood.model.js";
import {
  getPaginationParams,
  formatPaginatedResponse,
  parseSortParams,
} from "../utils/pagination.js";

export const logMood = async (req, res) => {
  try {
    const { mood, note, factors, intensity } = req.body;
    if (!mood) {
      return res.status(400).json({ error: { message: "Mood is required.", code: "VALIDATION_ERROR" } });
    }
    const validMoods = ["great", "good", "okay", "bad", "terrible"];
    if (!validMoods.includes(mood)) {
      return res.status(400).json({ error: { message: "Invalid mood value.", code: "VALIDATION_ERROR" } });
    }
    const moodEmojis = {
      great: "😄",
      good: "🙂",
      okay: "😐",
      bad: "😔",
      terrible: "😢",
    };
    const entry = new Mood({
      user: req.user.id,
      mood,
      emoji: moodEmojis[mood] || "",
      note: note || "",
      factors: factors || [],
      intensity: intensity || 5,
    });
    await entry.save();
    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

export const getMyMoods = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query, 100);
    const sort = parseSortParams(req.query, ["date", "createdAt"]);

    const filter = { user: req.user.id };

    // Support filtering by days, mood type, and intensity
    if (req.query.days) {
      const days = parseInt(req.query.days, 10);
      if (!isNaN(days) && days > 0) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        filter.date = { $gte: since };
      }
    }

    if (req.query.mood) {
      filter.mood = req.query.mood;
    }

    if (req.query.minIntensity || req.query.maxIntensity) {
      filter.intensity = {};
      if (req.query.minIntensity) {
        const min = parseInt(req.query.minIntensity, 10);
        if (!isNaN(min)) filter.intensity.$gte = min;
      }
      if (req.query.maxIntensity) {
        const max = parseInt(req.query.maxIntensity, 10);
        if (!isNaN(max)) filter.intensity.$lte = max;
      }
    }

    const total = await Mood.countDocuments(filter);
    const moods = await Mood.find(filter).sort(sort).limit(limit).skip(offset);

    res.status(200).json(formatPaginatedResponse(moods, total, page, limit));
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

export const getMoodStats = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const moods = await Mood.find({
      user: req.user.id,
      date: { $gte: thirtyDaysAgo },
    });
    const stats = {
      total: moods.length,
      averageIntensity: 0,
      moodDistribution: { great: 0, good: 0, okay: 0, bad: 0, terrible: 0 },
      streak: 0,
    };
    if (moods.length === 0) {
      return res.status(200).json(stats);
    }
    const totalIntensity = moods.reduce(
      (sum, m) => sum + (m.intensity || 5),
      0,
    );
    stats.averageIntensity =
      Math.round((totalIntensity / moods.length) * 10) / 10;
    moods.forEach((m) => {
      if (stats.moodDistribution[m.mood] !== undefined) {
        stats.moodDistribution[m.mood]++;
      }
    });
    const uniqueDates = [
      ...new Set(moods.map((m) => new Date(m.date).toDateString())),
    ];
    uniqueDates.sort((a, b) => new Date(b) - new Date(a));
    let streakCount = 0;
    const today = new Date().toDateString();
    if (
      uniqueDates[0] === today ||
      uniqueDates[0] === new Date(Date.now() - 86400000).toDateString()
    ) {
      streakCount = 1;
      for (let i = 1; i < uniqueDates.length; i++) {
        const prevDate = new Date(uniqueDates[i - 1]);
        const currDate = new Date(uniqueDates[i]);
        const diffDays = (prevDate - currDate) / 86400000;
        if (diffDays <= 1.5) {
          streakCount++;
        } else {
          break;
        }
      }
    }
    stats.streak = streakCount;
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

export const deleteMood = async (req, res) => {
  try {
    const { id } = req.params;
    const mood = await Mood.findOneAndDelete({ _id: id, user: req.user.id });
    if (!mood) {
      return res.status(404).json({ error: { message: "Mood entry not found.", code: "NOT_FOUND" } });
    }
    res.status(200).json({ message: "Mood entry deleted." });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};
