import Exercise from "../models/exercise.model.js";

// Default seed exercises if none exist in DB
const defaultExercises = [
  {
    title: "Box Breathing",
    description: "A calming technique used by Navy SEALs to reduce stress and improve focus. Breathe in a box pattern to regulate your nervous system.",
    duration: 240,
    type: "breathing",
    difficulty: "beginner",
    emoji: "🫁",
    color: "#06b6d4",
    steps: [
      { instruction: "Find a comfortable seated position and close your eyes.", duration: 5 },
      { instruction: "Inhale slowly through your nose for 4 counts.", duration: 4 },
      { instruction: "Hold your breath for 4 counts.", duration: 4 },
      { instruction: "Exhale slowly through your mouth for 4 counts.", duration: 4 },
      { instruction: "Hold empty for 4 counts.", duration: 4 },
      { instruction: "Repeat this cycle 4–6 more times.", duration: 220 },
    ],
  },
  {
    title: "5-Minute Body Scan",
    description: "A mindfulness practice to reconnect with your body, release tension, and ground yourself in the present moment.",
    duration: 300,
    type: "mindfulness",
    difficulty: "beginner",
    emoji: "🧘",
    color: "#8b5cf6",
    steps: [
      { instruction: "Lie down or sit comfortably. Close your eyes.", duration: 10 },
      { instruction: "Take three deep breaths, releasing tension with each exhale.", duration: 20 },
      { instruction: "Bring your attention to the top of your head. Notice any sensations.", duration: 30 },
      { instruction: "Slowly move your awareness down to your face, jaw, and neck.", duration: 30 },
      { instruction: "Shift attention to your shoulders and arms. Let them relax.", duration: 30 },
      { instruction: "Notice your chest and belly rising and falling with each breath.", duration: 30 },
      { instruction: "Move awareness to your hips, legs, and feet.", duration: 30 },
      { instruction: "Take a final deep breath and slowly open your eyes.", duration: 120 },
    ],
  },
  {
    title: "Gratitude Journal",
    description: "Research shows that writing 3 things you're grateful for can significantly boost happiness and reduce anxiety over time.",
    duration: 300,
    type: "gratitude",
    difficulty: "beginner",
    emoji: "📔",
    color: "#f59e0b",
    steps: [
      { instruction: "Take a moment to settle and breathe slowly.", duration: 30 },
      { instruction: "Think of one person in your life you're grateful for. Why?", duration: 60 },
      { instruction: "Think of one experience from today, however small, that was positive.", duration: 60 },
      { instruction: "Think of one thing about yourself you appreciate.", duration: 60 },
      { instruction: "Write these three things down or simply hold them in your mind.", duration: 90 },
    ],
  },
  {
    title: "5-4-3-2-1 Grounding",
    description: "A powerful anxiety-relief technique that uses your five senses to bring you back to the present moment and stop spiraling thoughts.",
    duration: 180,
    type: "grounding",
    difficulty: "beginner",
    emoji: "🌍",
    color: "#10b981",
    steps: [
      { instruction: "Look around and name 5 things you can SEE.", duration: 30 },
      { instruction: "Notice 4 things you can physically TOUCH. Feel their texture.", duration: 30 },
      { instruction: "Listen for 3 things you can HEAR right now.", duration: 30 },
      { instruction: "Identify 2 things you can SMELL (or scents you enjoy).", duration: 30 },
      { instruction: "Notice 1 thing you can TASTE.", duration: 30 },
      { instruction: "Take a slow breath. You are safe. You are here.", duration: 30 },
    ],
  },
  {
    title: "Progressive Muscle Relaxation",
    description: "Systematically tense and release muscle groups to melt away physical stress and help your body reach a deeply relaxed state.",
    duration: 420,
    type: "movement",
    difficulty: "beginner",
    emoji: "💪",
    color: "#ef4444",
    steps: [
      { instruction: "Sit or lie down comfortably. Take 3 deep breaths.", duration: 20 },
      { instruction: "Clench your fists tightly for 5 seconds, then release.", duration: 10 },
      { instruction: "Tense your biceps for 5 seconds, then let go completely.", duration: 10 },
      { instruction: "Shrug your shoulders to your ears for 5 seconds, then drop.", duration: 10 },
      { instruction: "Scrunch your face muscles tightly, then release.", duration: 10 },
      { instruction: "Tighten your stomach muscles for 5 seconds, then relax.", duration: 10 },
      { instruction: "Tense your thighs and glutes for 5 seconds, then release.", duration: 10 },
      { instruction: "Curl your toes tightly for 5 seconds, then spread them wide.", duration: 10 },
      { instruction: "Enjoy the warm sensation of complete relaxation.", duration: 310 },
    ],
  },
  {
    title: "4-7-8 Breathing",
    description: "Dr. Andrew Weil's natural tranquilizer for the nervous system. This technique can help you fall asleep and manage acute stress.",
    duration: 180,
    type: "breathing",
    difficulty: "intermediate",
    emoji: "🌬️",
    color: "#3b82f6",
    steps: [
      { instruction: "Sit upright. Place the tip of your tongue behind your upper front teeth.", duration: 10 },
      { instruction: "Exhale completely through your mouth, making a 'whoosh' sound.", duration: 5 },
      { instruction: "Close your mouth. Inhale quietly through your nose for 4 counts.", duration: 4 },
      { instruction: "Hold your breath for 7 counts.", duration: 7 },
      { instruction: "Exhale completely through your mouth for 8 counts.", duration: 8 },
      { instruction: "Repeat this cycle 3–4 more times.", duration: 146 },
    ],
  },
];

export const getAllExercises = async (req, res) => {
  try {
    let exercises = await Exercise.find();

    // Seed default exercises if DB is empty
    if (exercises.length === 0) {
      exercises = await Exercise.insertMany(defaultExercises);
    }

    res.status(200).json(exercises);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getExerciseById = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise) {
      return res.status(404).json({ message: "Exercise not found" });
    }
    res.status(200).json(exercise);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createExercise = async (req, res) => {
  try {
    const exercise = new Exercise(req.body);
    await exercise.save();
    res.status(201).json(exercise);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
