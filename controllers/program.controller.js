import { Program, UserProgress } from "../models/program.model.js"
import { awardMessagePoints } from "../utils/points.js"
import logger from "../utils/logger.js"
import { SEED_PROGRAMS } from "./programSeedData.js"

export const getPrograms = async (req, res) => {
  try {
    const { category } = req.query
    const filter = {}
    if (category) filter.category = category

    const programs = await Program.find(filter).sort({ createdAt: 1 })
    const progress = await UserProgress.find({ user: req.user.id })

    const progressMap = new Map()
    for (const p of progress) {
      progressMap.set(p.program.toString(), p)
    }

    const result = programs.map((prog) => {
      const p = progressMap.get(prog._id.toString())
      const totalActivities = prog.weeks.reduce(
        (sum, w) => sum + w.activities.length,
        0,
      )
      const completedCount = p ? p.completedActivities.length : 0

      return {
        _id: prog._id,
        title: prog.title,
        description: prog.description,
        category: prog.category,
        duration: prog.duration,
        totalWeeks: prog.weeks.length,
        totalActivities,
        progress: p
          ? {
              currentWeek: p.currentWeek,
              currentActivity: p.currentActivity,
              completedCount,
              totalActivities,
              percentage:
                totalActivities > 0
                  ? Math.round((completedCount / totalActivities) * 100)
                  : 0,
              completed: p.completedWeeks.length === prog.weeks.length,
              startedAt: p.startedAt,
              lastActivityAt: p.lastActivityAt,
            }
          : null,
      }
    })

    res.status(200).json({ programs: result })
  } catch (error) {
      throw error
    }
}

export const getProgram = async (req, res) => {
  try {
    const program = await Program.findById(req.params.id)
    if (!program) {
      return res
        .status(404)
        .json({ error: { message: "Program not found", code: "NOT_FOUND", category: "USER" } })
    }

    const progress = await UserProgress.findOne({
      user: req.user.id,
      program: program._id,
    })

    res.status(200).json({ program, progress })
  } catch (error) {
      throw error
    }
}

export const startProgram = async (req, res) => {
  try {
    const program = await Program.findById(req.params.id)
    if (!program) {
      return res
        .status(404)
        .json({ error: { message: "Program not found", code: "NOT_FOUND", category: "USER" } })
    }

    const existing = await UserProgress.findOne({
      user: req.user.id,
      program: program._id,
    })

    if (existing) {
      return res.status(200).json({ progress: existing })
    }

    const progress = new UserProgress({
      user: req.user.id,
      program: program._id,
      currentWeek: 0,
      currentActivity: 0,
    })
    await progress.save()

    res.status(201).json({ progress })
  } catch (error) {
      throw error
    }
}

export const completeActivity = async (req, res) => {
  try {
    const { weekIndex, activityIndex } = req.body
    if (weekIndex === undefined || activityIndex === undefined) {
      return res.status(400).json({
        error: { message: "weekIndex and activityIndex are required", code: "VALIDATION_ERROR", category: "USER" },
      })
    }

    const program = await Program.findById(req.params.id)
    if (!program) {
      return res
        .status(404)
        .json({ error: { message: "Program not found", code: "NOT_FOUND", category: "USER" } })
    }

    if (
      weekIndex < 0 ||
      weekIndex >= program.weeks.length ||
      activityIndex < 0 ||
      activityIndex >= program.weeks[weekIndex].activities.length
    ) {
      return res.status(400).json({
        error: { message: "Invalid week or activity index", code: "VALIDATION_ERROR", category: "USER" },
      })
    }

    let progress = await UserProgress.findOne({
      user: req.user.id,
      program: program._id,
    })

    if (!progress) {
      progress = new UserProgress({
        user: req.user.id,
        program: program._id,
      })
    }

    const alreadyCompleted = progress.completedActivities.some(
      (a) => a.weekIndex === weekIndex && a.activityIndex === activityIndex,
    )

    if (!alreadyCompleted) {
      progress.completedActivities.push({ weekIndex, activityIndex })
    }

    progress.lastActivityAt = new Date()

    const weekActivityCount = program.weeks[weekIndex].activities.length
    const completedInWeek = progress.completedActivities.filter(
      (a) => a.weekIndex === weekIndex,
    ).length

    let weekCompleted = false
    let pointsEarned = 0

    if (
      completedInWeek >= weekActivityCount &&
      !progress.completedWeeks.includes(weekIndex)
    ) {
      progress.completedWeeks.push(weekIndex)
      weekCompleted = true
      pointsEarned = 5
      await awardMessagePoints(req.user.id, pointsEarned)
    }

    const nextActivityIndex = activityIndex + 1
    const nextWeekIndex = weekIndex + 1

    if (nextActivityIndex < program.weeks[weekIndex].activities.length) {
      progress.currentWeek = weekIndex
      progress.currentActivity = nextActivityIndex
    } else if (nextWeekIndex < program.weeks.length) {
      progress.currentWeek = nextWeekIndex
      progress.currentActivity = 0
    }

    await progress.save()

    const totalActivities = program.weeks.reduce(
      (sum, w) => sum + w.activities.length,
      0,
    )

    res.status(200).json({
      progress: {
        currentWeek: progress.currentWeek,
        currentActivity: progress.currentActivity,
        completedWeeks: progress.completedWeeks,
        completedActivities: progress.completedActivities,
        lastActivityAt: progress.lastActivityAt,
      },
      weekCompleted,
      pointsEarned,
      completedCount: progress.completedActivities.length,
      totalActivities,
      percentage:
        totalActivities > 0
          ? Math.round(
              (progress.completedActivities.length / totalActivities) * 100,
            )
          : 0,
    })
  } catch (error) {
      throw error
    }
}

export const getMyPrograms = async (req, res) => {
  try {
    const progresses = await UserProgress.find({ user: req.user.id })
      .populate("program")
      .sort({ lastActivityAt: -1 })

    const result = progresses.map((p) => {
      const prog = p.program
      const totalActivities = prog.weeks.reduce(
        (sum, w) => sum + w.activities.length,
        0,
      )
      const completedCount = p.completedActivities.length
      const isCompleted = p.completedWeeks.length === prog.weeks.length

      return {
        _id: prog._id,
        title: prog.title,
        description: prog.description,
        category: prog.category,
        duration: prog.duration,
        totalWeeks: prog.weeks.length,
        totalActivities,
        progress: {
          currentWeek: p.currentWeek,
          currentActivity: p.currentActivity,
          completedCount,
          totalActivities,
          percentage:
            totalActivities > 0
              ? Math.round((completedCount / totalActivities) * 100)
              : 0,
          completed: isCompleted,
          startedAt: p.startedAt,
          lastActivityAt: p.lastActivityAt,
        },
      }
    })

    const inProgress = result.filter((r) => !r.progress.completed)
    const completed = result.filter((r) => r.progress.completed)

    res.status(200).json({ inProgress, completed })
  } catch (error) {
      throw error
    }
}

export const seedPrograms = async () => {
  try {
    const count = await Program.countDocuments()
    if (count === 0) {
      await Program.insertMany(SEED_PROGRAMS)
      logger.info("Seeded 3 programs")
    }
  } catch (error) {
    logger.error({ err: error }, "failed to seed programs")
  }
}
