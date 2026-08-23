import Mood from "../models/mood.model.js";
import Assessment from "../models/assessment.model.js";
import ExerciseLog from "../models/exerciseLog.model.js";
import GratitudeEntry from "../models/gratitude.model.js";
import Activity from "../models/activity.model.js";
import ThoughtRecord from "../models/thoughtRecord.model.js";
import logger from "../utils/logger.js";

const MOOD_SCORE = { great: 5, good: 4, okay: 3, bad: 2, terrible: 1 };

const SEVERITY_RANK = {
  minimal: 0,
  mild: 1,
  moderate: 2,
  moderately_severe: 3,
  severe: 4,
};

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function avgMoodScore(moods) {
  if (moods.length === 0) return null;
  const sum = moods.reduce((s, m) => s + (MOOD_SCORE[m.mood] ?? 3), 0);
  return sum / moods.length;
}

function moodTrend(moods) {
  if (moods.length < 4) return "insufficient";
  const mid = Math.floor(moods.length / 2);
  const firstHalf = moods.slice(0, mid);
  const secondHalf = moods.slice(mid);
  const avgFirst = avgMoodScore(firstHalf);
  const avgSecond = avgMoodScore(secondHalf);
  if (avgFirst === null || avgSecond === null) return "insufficient";
  const diff = avgSecond - avgFirst;
  if (diff < -0.6) return "declining";
  if (diff > 0.6) return "improving";
  return "stable";
}

function sleepRelatedFactors(moods) {
  const sleepKeywords = ["sleep", "insomnia", "rest", "tired", "fatigue", "exhausted"];
  return moods.filter((m) =>
    (m.factors || []).some((f) =>
      sleepKeywords.some((kw) => f.toLowerCase().includes(kw))
    )
  );
}

function latestAssessmentByType(assessments, type) {
  return assessments.find((a) => a.type === type) || null;
}

function buildRecommendation(id, type, title, description, reason, priority, actionUrl, icon) {
  return { id, type, title, description, reason, priority, actionUrl, icon };
}

export const getRecommendations = async (req, res) => {
  try {
    const userId = req.user.id;
    const fourteenDaysAgo = daysAgo(14);
    const sevenDaysAgo = daysAgo(7);

    const [moods, assessments, exerciseLogs, gratitudeEntries, activities, thoughtRecords] =
      await Promise.all([
        Mood.find({ user: userId, date: { $gte: fourteenDaysAgo } })
          .sort({ date: 1 })
          .lean(),
        Assessment.find({ user: userId })
          .sort({ createdAt: -1 })
          .limit(4)
          .lean(),
        ExerciseLog.find({ user: userId, createdAt: { $gte: sevenDaysAgo } }).lean(),
        GratitudeEntry.find({ user: userId, createdAt: { $gte: sevenDaysAgo } }).lean(),
        Activity.find({ user: userId, createdAt: { $gte: sevenDaysAgo } }).lean(),
        ThoughtRecord.find({ user: userId })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
      ]);

    const trend = moodTrend(moods);
    const avgMood = avgMoodScore(moods);
    const recentMoods = moods.slice(-7);
    const recentAvgMood = avgMoodScore(recentMoods);
    const sleepMoods = sleepRelatedFactors(moods);

    const latestGad7 = latestAssessmentByType(assessments, "gad7");
    const latestPhq9 = latestAssessmentByType(assessments, "phq9");
    const latestPss = latestAssessmentByType(assessments, "pss");

    const exerciseCount = exerciseLogs.filter((l) => l.completed).length;
    const gratitudeCount = gratitudeEntries.length;
    const activityCount = activities.filter((a) => a.completed).length;
    const thoughtRecordCount = thoughtRecords.length;

    const recommendations = [];
    let recId = 0;

    // 1. Mood declining → suggest specific exercises
    if (trend === "declining") {
      const lastMood = moods[moods.length - 1];
      const lastMoodVal = MOOD_SCORE[lastMood?.mood] ?? 3;

      if (lastMoodVal <= 2) {
        recommendations.push(
          buildRecommendation(
            ++recId,
            "exercise",
            "Try a Guided Breathing Exercise",
            "When mood dips, controlled breathing can activate your parasympathetic nervous system and help restore calm.",
            "Your mood has been trending downward over the past two weeks. Breathing exercises are one of the fastest ways to regulate your nervous system when you're feeling low.",
            "high",
            "/activities",
            "Wind"
          )
        );
      } else {
        recommendations.push(
          buildRecommendation(
            ++recId,
            "exercise",
            "Try a Mindfulness Body Scan",
            "A 5-minute body scan can help reconnect you with the present moment and interrupt negative thought spirals.",
            "Your mood has been declining recently. Mindfulness exercises help you observe feelings without judgment and can break cycles of low mood.",
            "high",
            "/activities",
            "Brain"
          )
        );
      }
    }

    // 2. Stable low mood (average below 3 over 14 days) → behavioral activation
    if (avgMood !== null && avgMood < 3 && trend !== "declining") {
      recommendations.push(
        buildRecommendation(
          ++recId,
          "program",
          "Behavioral Activation Activities",
          "Scheduling enjoyable or meaningful activities is one of the most effective ways to lift persistent low mood.",
          "Your average mood over the past two weeks has been consistently below neutral. Behavioral activation — planning small, achievable activities — is a core technique for breaking out of low-mood patterns.",
          "high",
          "/activities",
          "CalendarCheck"
        )
      );
    }

    // 3. Anxiety elevated (GAD-7 moderate+) → breathing/grounding
    if (latestGad7 && SEVERITY_RANK[latestGad7.severity] >= SEVERITY_RANK.moderate) {
      const exerciseType =
        latestGad7.severity === "severe" ? "grounding" : "breathing";
      const title =
        exerciseType === "grounding"
          ? "5-4-3-2-1 Grounding Technique"
          : "Box Breathing Exercise";
      const desc =
        exerciseType === "grounding"
          ? "Use your five senses to anchor yourself in the present and interrupt anxiety spirals."
          : "A structured breathing pattern that activates your body's relaxation response.";

      recommendations.push(
        buildRecommendation(
          ++recId,
          "exercise",
          title,
          desc,
          `Your most recent GAD-7 score indicates ${latestGad7.severity.replace("_", " ")} anxiety. ${exerciseType === "grounding" ? "Grounding techniques" : "Breathing exercises"} are specifically recommended for managing anxiety at this level.`,
          "high",
          "/activities",
          exerciseType === "grounding" ? "Crosshair" : "Wind"
        )
      );
    }

    // 4. Depression elevated (PHQ-9 moderate+) → behavioral activation + thought records
    if (latestPhq9 && SEVERITY_RANK[latestPhq9.severity] >= SEVERITY_RANK.moderate) {
      recommendations.push(
        buildRecommendation(
          ++recId,
          "thought_record",
          "Complete a Thought Record",
          "Challenge negative automatic thoughts with evidence-based CBT techniques to shift your thinking patterns.",
          `Your most recent PHQ-9 score indicates ${latestPhq9.severity.replace("_", " ")} depression. Thought records help identify and reframe the cognitive distortions that maintain depressive episodes.`,
          "high",
          "/thought-records",
          "Pencil"
        )
      );
    }

    // 5. High stress (PSS moderate+) → stress management
    if (latestPss && SEVERITY_RANK[latestPss.severity] >= SEVERITY_RANK.moderate) {
      recommendations.push(
        buildRecommendation(
          ++recId,
          "exercise",
          "Progressive Muscle Relaxation",
          "Systematically tense and release muscle groups to reduce the physical symptoms of stress.",
          `Your Perceived Stress Scale score indicates ${latestPss.severity} stress. Progressive muscle relaxation directly addresses the physical tension that accompanies chronic stress.`,
          "medium",
          "/activities",
          "Activity"
        )
      );
    }

    // 6. No exercises in 7 days → suggest beginner exercises
    if (exerciseCount === 0) {
      recommendations.push(
        buildRecommendation(
          ++recId,
          "exercise",
          "Start with a Beginner Exercise",
          "Even a few minutes of guided practice can make a meaningful difference in how you feel today.",
          "You haven't completed any exercises in the past 7 days. Starting with a short, beginner-level exercise is a great way to rebuild your wellness routine without feeling overwhelmed.",
          exerciseCount === 0 && avgMood !== null && avgMood < 3 ? "high" : "medium",
          "/activities",
          "Play"
        )
      );
    }

    // 7. No gratitude entries in 7 days → suggest gratitude journaling
    if (gratitudeCount === 0) {
      recommendations.push(
        buildRecommendation(
          ++recId,
          "gratitude",
          "Daily Gratitude Journal",
          "Writing down things you're grateful for has been shown to boost happiness and reduce anxiety over time.",
          "You haven't logged any gratitude entries this week. Research shows that a consistent gratitude practice can shift your attention toward positive experiences and improve overall wellbeing.",
          "medium",
          "/gratitude",
          "Heart"
        )
      );
    }

    // 8. Sleep-related mood factors → suggest sleep content
    if (sleepMoods.length >= 2) {
      recommendations.push(
        buildRecommendation(
          ++recId,
          "sleep",
          "Sleep Hygiene & Relaxation",
          "Poor sleep quality can significantly impact mood and anxiety. These exercises can help you wind down before bed.",
          `You've mentioned sleep-related concerns in ${sleepMoods.length} of your recent mood entries. Improving sleep hygiene is one of the most impactful changes you can make for your mental health.`,
          "high",
          "/activities",
          "Moon"
        )
      );
    } else if (latestPhq9) {
      // PHQ-9 question 3 is about sleep — check if they scored >= 1
      const sleepResponse = latestPhq9.responses?.find((r) => r.questionIndex === 2);
      if (sleepResponse && sleepResponse.value >= 2) {
        recommendations.push(
          buildRecommendation(
            ++recId,
            "sleep",
            "Sleep Hygiene & Relaxation",
            "Difficulty with sleep is common alongside low mood. These guided practices can help you establish a calming bedtime routine.",
            "Your PHQ-9 responses indicate significant sleep difficulties. Sleep and mood are deeply interconnected — addressing sleep can improve your overall mental health.",
            "medium",
            "/activities",
            "Moon"
          )
        );
      }
    }

    // 9. No thought records and mood is bad → suggest CBT
    if (thoughtRecordCount === 0 && recentAvgMood !== null && recentAvgMood <= 2.5) {
      recommendations.push(
        buildRecommendation(
          ++recId,
          "thought_record",
          "Try a Thought Record",
          "Identify and challenge negative automatic thoughts — a foundational CBT skill for improving mood.",
          "You haven't created any thought records, and your recent mood has been low. Thought records are a powerful tool for recognizing the thinking patterns that keep you stuck.",
          "medium",
          "/thought-records",
          "Pencil"
        )
      );
    }

    // 10. No recent activities and low mood → behavioral activation
    if (activityCount === 0 && recentAvgMood !== null && recentAvgMood <= 3) {
      recommendations.push(
        buildRecommendation(
          ++recId,
          "program",
          "Schedule a Pleasant Activity",
          "Planning even one enjoyable activity this week can create momentum toward feeling better.",
          "You haven't completed any activities recently and your mood has been low. Behavioral activation — deliberately scheduling positive experiences — is one of the most effective interventions for low mood.",
          "medium",
          "/activities",
          "CalendarPlus"
        )
      );
    }

    // 11. Assessment overdue (no assessment in 30+ days) → suggest taking one
    const oldestAssessment = assessments[assessments.length - 1];
    if (!oldestAssessment || new Date(oldestAssessment.createdAt) < daysAgo(30)) {
      recommendations.push(
        buildRecommendation(
          ++recId,
          "assessment",
          "Check In with a Wellness Assessment",
          "Regular check-ins help you and your therapist track your progress and adjust your care plan.",
          "It's been a while since your last assessment. Periodic self-assessments provide valuable data about your mental health trends and help identify areas that may need attention.",
          "low",
          "/assessments",
          "ClipboardCheck"
        )
      );
    }

    // Sort: high first, then medium, then low; cap at 5
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    const capped = recommendations.slice(0, 5);

    res.status(200).json({ recommendations: capped });
  } catch (err) {
    logger.error({ err }, "failed to generate recommendations");
    throw err;
  }
};
