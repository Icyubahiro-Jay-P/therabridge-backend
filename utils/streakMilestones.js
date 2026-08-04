const MILESTONES = [3, 7, 14, 30, 60, 90, 180, 365];

const MILESTONE_LABELS = {
  3: { title: "Getting Started" },
  7: { title: "One Week Strong" },
  14: { title: "Two Week Fire" },
  30: { title: "One Month Strong" },
  60: { title: "Two Month Champion" },
  90: { title: "90 Day Warrior" },
  180: { title: "Six Month Legend" },
  365: { title: "One Year Hero" },
};

export function isMilestone(streak) {
  return MILESTONES.includes(streak);
}

export function getMilestoneInfo(streak) {
  return MILESTONE_LABELS[streak] || null;
}
