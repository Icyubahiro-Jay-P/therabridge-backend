import ExerciseLog from "../models/exerciseLog.model.js";
import Exercise from "../models/exercise.model.js";
import User from "../models/user.model.js";

export const startExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise) {
      return res.status(404).json({ message: "Exercise not found" });
    }

    const log = new ExerciseLog({
      user: req.user.id,
      exercise: exercise._id,
      startedAt: new Date(),
    });

    await log.save();
    res.status(201).json({ logId: log._id, startedAt: log.startedAt });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const completeExercise = async (req, res) => {
  try {
    const { logId, timeSpent } = req.body;

    const log = await ExerciseLog.findOne({ _id: logId, user: req.user.id });
    if (!log) {
      return res.status(404).json({ message: "Exercise session not found" });
    }

    if (log.completed) {
      return res.status(400).json({ message: "Exercise already completed" });
    }

    const exercise = await Exercise.findById(log.exercise);
    if (!exercise) {
      return res.status(404).json({ message: "Exercise not found" });
    }

    const minRequired = exercise.duration * 0.7;
    if (timeSpent < minRequired) {
      return res.status(400).json({
        message: `Please spend at least ${Math.ceil(minRequired / 60)} minutes on this exercise.`,
      });
    }

    log.completed = true;
    log.completedAt = new Date();
    log.timeSpent = timeSpent;
    await log.save();

    // Update exercise score and streak
    const pointsEarned = Math.max(10, Math.floor(timeSpent / 60) * 5);
    const user = await User.findById(req.user.id);
    if (user) {
      user.exerciseScore = (user.exerciseScore || 0) + pointsEarned;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastExercise = user.lastExerciseDate ? new Date(user.lastExerciseDate) : null;
      if (lastExercise) {
        lastExercise.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today - lastExercise) / 86400000);
        if (diffDays === 1) {
          user.exerciseStreak = (user.exerciseStreak || 0) + 1;
        } else if (diffDays > 1) {
          user.exerciseStreak = 1;
        }
      } else {
        user.exerciseStreak = 1;
      }
      if (user.exerciseStreak > (user.longestExerciseStreak || 0)) {
        user.longestExerciseStreak = user.exerciseStreak;
      }
      user.lastExerciseDate = today;
      await user.save();
    }

    res.status(200).json({
      message: "Exercise completed!",
      log,
      pointsEarned,
      exerciseScore: user?.exerciseScore || 0,
      exerciseStreak: user?.exerciseStreak || 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getLogs = async (req, res) => {
  try {
    const logs = await ExerciseLog.find({ user: req.user.id })
      .populate("exercise", "title emoji color type duration")
      .sort("-startedAt")
      .limit(50);

    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
