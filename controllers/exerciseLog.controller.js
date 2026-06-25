import ExerciseLog from "../models/exerciseLog.model.js";
import Exercise from "../models/exercise.model.js";

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

    res.status(200).json({ message: "Exercise completed!", log });
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
