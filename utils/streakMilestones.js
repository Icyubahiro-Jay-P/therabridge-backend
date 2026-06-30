const MILESTONES = [3, 7, 14, 30, 60, 90, 180, 365];

const MILESTONE_LABELS = {
  3: { emoji: "🌱", title: "Getting Started" },
  7: { emoji: "💪", title: "One Week Strong" },
  14: { emoji: "🔥", title: "Two Week Fire" },
  30: { emoji: "⚡", title: "One Month Strong" },
  60: { emoji: "⭐", title: "Two Month Champion" },
  90: { emoji: "🏆", title: "90 Day Warrior" },
  180: { emoji: "👑", title: "Six Month Legend" },
  365: { emoji: "🌟", title: "One Year Hero" },
};

export function isMilestone(streak) {
  return MILESTONES.includes(streak);
}

export function getMilestoneInfo(streak) {
  return MILESTONE_LABELS[streak] || null;
}
