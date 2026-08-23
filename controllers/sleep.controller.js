import { SleepLog, SleepContent } from "../models/sleep.model.js"
import { encryptField, decryptField } from "../utils/crypto.js"
import { awardMessagePoints } from "../utils/points.js"
import {
  getPaginationParams,
  formatPaginatedResponse,
} from "../utils/pagination.js"
import logger from "../utils/logger.js"

const decryptLog = (log) => {
  const obj = log.toObject()
  obj.notes = decryptField(obj.notes)
  obj.dreams = decryptField(obj.dreams)
  return obj
}

const SEED_CONTENT = [
  {
    title: "Rain on Window",
    type: "sound",
    duration: 300,
    category: "rain",
    audioUrl: "/audio/rain-window.mp3",
    description:
      "Gentle rain tapping against a window pane, creating a soothing rhythm that eases you into restful sleep.",
  },
  {
    title: "Ocean Waves",
    type: "sound",
    duration: 600,
    category: "nature",
    audioUrl: "/audio/ocean-waves.mp3",
    description:
      "Soft ocean waves rolling onto a quiet shore. The steady ebb and flow calms the mind and body.",
  },
  {
    title: "Forest Night",
    type: "sound",
    duration: 480,
    category: "nature",
    audioUrl: "/audio/forest-night.mp3",
    description:
      "Crickets, distant owls, and rustling leaves create a peaceful forest atmosphere under a moonlit sky.",
  },
  {
    title: "Fireplace Crackling",
    type: "sound",
    duration: 360,
    category: "ambient",
    audioUrl: "/audio/fireplace.mp3",
    description:
      "A warm fireplace crackles softly, filling the room with gentle pops and a cozy, comforting presence.",
  },
  {
    title: "Wind Chimes",
    type: "sound",
    duration: 300,
    category: "ambient",
    audioUrl: "/audio/wind-chimes.mp3",
    description:
      "Delicate wind chimes sway in a light breeze, producing airy, bell-like tones that invite tranquility.",
  },
  {
    title: "Body Scan for Sleep",
    type: "meditation",
    duration: 900,
    category: "body_scan",
    audioUrl: "/audio/body-scan-sleep.mp3",
    description:
      "A slow, guided body scan that releases tension from head to toe. Designed to quiet the body before sleep.",
  },
  {
    title: "Progressive Muscle Relaxation",
    type: "meditation",
    duration: 720,
    category: "body_scan",
    audioUrl: "/audio/pmr-sleep.mp3",
    description:
      "Systematically tense and release each muscle group, melting away the day's stress before drifting off.",
  },
  {
    title: "4-7-8 Breathing",
    type: "meditation",
    duration: 480,
    category: "breathing",
    audioUrl: "/audio/breathing-478.mp3",
    description:
      "The 4-7-8 breathing technique activates your parasympathetic nervous system, signaling it's time to rest.",
  },
  {
    title: "Loving Kindness for Sleep",
    type: "meditation",
    duration: 600,
    category: "meditation",
    audioUrl: "/audio/loving-kindness-sleep.mp3",
    description:
      "A gentle loving-kindness meditation that fills you with warmth and compassion as you settle into sleep.",
  },
  {
    title: "Night Walk Through Garden",
    type: "story",
    duration: 480,
    category: "meditation",
    audioUrl: "/audio/night-garden.mp3",
    description:
      "A soothing narrated walk through a moonlit garden. Notice the fragrance of night-blooming flowers underfoot.",
  },
  {
    title: "Starry Night Campfire",
    type: "story",
    duration: 600,
    category: "ambient",
    audioUrl: "/audio/starry-campfire.mp3",
    description:
      "Relax by a distant campfire under a vast, starry sky. The narration gently slows as the embers fade.",
  },
  {
    title: "Peaceful Library",
    type: "story",
    duration: 420,
    category: "ambient",
    audioUrl: "/audio/peaceful-library.mp3",
    description:
      "Settle into a quiet, candlelit library on a rainy night. Pages turn softly as the world outside fades away.",
  },
]

export const seedSleepContent = async () => {
  try {
    const count = await SleepContent.countDocuments()
    if (count === 0) {
      await SleepContent.insertMany(SEED_CONTENT)
      logger.info("Sleep content seeded")
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed sleep content")
  }
}

export const logSleep = async (req, res) => {
  try {
    const { date, quality, bedtime, wakeTime, hoursSlept, notes, dreams } =
      req.body

    const entry = new SleepLog({
      user: req.user.id,
      date: date ? new Date(date) : new Date(),
      quality,
      bedtime: bedtime || "",
      wakeTime: wakeTime || "",
      hoursSlept: hoursSlept || 0,
      notes: encryptField(notes || ""),
      dreams: encryptField(dreams || ""),
    })

    await entry.save()

    const pointsEarned = await awardMessagePoints(req.user.id, 3)
    res.status(201).json({ ...decryptLog(entry), pointsEarned })
  } catch (err) {
      throw err
    }
}

export const getMyLogs = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query, 100)

    const total = await SleepLog.countDocuments({ user: req.user.id })
    const logs = await SleepLog.find({ user: req.user.id })
      .sort({ date: -1 })
      .skip(offset)
      .limit(limit)

    const data = logs.map(decryptLog)
    res.status(200).json(formatPaginatedResponse(data, total, page, limit))
  } catch (err) {
      throw err
    }
}

export const getSleepStats = async (req, res) => {
  try {
    const logs = await SleepLog.find({ user: req.user.id })
      .sort({ date: -1 })
      .limit(100)

    if (logs.length === 0) {
      return res.status(200).json({
        avgQuality: 0,
        avgHours: 0,
        totalLogs: 0,
        streak: 0,
        weeklyTrend: [],
      })
    }

    const avgQuality =
      Math.round(
      (logs.reduce((sum, l) => sum + l.quality, 0) / logs.length) * 10,
    ) / 10

    const avgHours =
      Math.round(
      (logs.reduce((sum, l) => sum + l.hoursSlept, 0) / logs.length) * 10,
    ) / 10

    // Streak: consecutive days with a log
    const uniqueDates = [
      ...new Set(logs.map((l) => new Date(l.date).toDateString())),
    ]
    uniqueDates.sort((a, b) => new Date(b) - new Date(a))

    let streak = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = 0; i < uniqueDates.length; i++) {
      const expected = new Date(today)
      expected.setDate(expected.getDate() - i)
      expected.setHours(0, 0, 0, 0)

      if (new Date(uniqueDates[i]).getTime() === expected.getTime()) {
        streak++
      } else {
        break
      }
    }

    // Weekly trend: last 7 days quality
    const weeklyTrend = []
    for (let i = 6; i >= 0; i--) {
      const day = new Date(today)
      day.setDate(day.getDate() - i)
      day.setHours(0, 0, 0, 0)

      const dayLogs = logs.filter((l) => {
        const ld = new Date(l.date)
        ld.setHours(0, 0, 0, 0)
        return ld.getTime() === day.getTime()
      })

      weeklyTrend.push({
        date: day.toISOString().slice(0, 10),
        quality: dayLogs.length > 0
          ? Math.round(
              (dayLogs.reduce((s, l) => s + l.quality, 0) / dayLogs.length) *
                10,
            ) / 10
          : 0,
        hours: dayLogs.length > 0
          ? Math.round(
              (dayLogs.reduce((s, l) => s + l.hoursSlept, 0) /
                dayLogs.length) *
                10,
            ) / 10
          : 0,
        count: dayLogs.length,
      })
    }

    res.status(200).json({
      avgQuality,
      avgHours,
      totalLogs: logs.length,
      streak,
      weeklyTrend,
    })
  } catch (err) {
      throw err
    }
}

export const getContent = async (req, res) => {
  try {
    const { type, category } = req.query
    const filter = {}
    if (type) filter.type = type
    if (category) filter.category = category

    const content = await SleepContent.find(filter).sort({ type: 1, title: 1 })
    res.status(200).json({ content })
  } catch (err) {
      throw err
    }
}

export const deleteLog = async (req, res) => {
  try {
    const log = await SleepLog.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!log) {
      return res
        .status(404)
        .json({ error: { message: "Sleep log not found", code: "NOT_FOUND", category: "USER" } })
    }
    res.status(200).json({ message: "Sleep log deleted" })
  } catch (err) {
      throw err
    }
}
