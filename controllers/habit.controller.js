import { Habit, HabitLog } from "../models/habit.model.js"
import { encryptField, decryptField } from "../utils/crypto.js"
import { awardMessagePoints } from "../utils/points.js"
import { awardPetXp } from "../utils/petXp.js"

const HABIT_POINTS = 2
const HABIT_PET_XP = 3

// How far back we load logs for streak/rate math. Long enough for a year of
// history, short enough that the in-memory pass stays trivial.
const LOG_WINDOW_DAYS = 400

const DAY_MS = 24 * 60 * 60 * 1000

const toKey = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// Streaks count consecutive *scheduled* days that were completed; unscheduled
// days neither extend nor break a streak. Today may still be pending, so an
// incomplete reference date never breaks the streak - yesterday decides it.
export const computeCurrentStreak = (completedDates, daysOfWeek, refDateStr) => {
  if (daysOfWeek.length === 0) return 0
  let streak = 0
  const cursor = new Date(`${refDateStr}T00:00:00`)
  if (cursor.toString() === "Invalid Date") return 0

  if (daysOfWeek.includes(cursor.getDay()) && completedDates.has(toKey(cursor))) {
    streak += 1
  }
  cursor.setTime(cursor.getTime() - DAY_MS)
  while (streak < LOG_WINDOW_DAYS) {
    if (daysOfWeek.includes(cursor.getDay())) {
      if (!completedDates.has(toKey(cursor))) break
      streak += 1
    }
    cursor.setTime(cursor.getTime() - DAY_MS)
  }
  return streak
}

export const computeLongestStreak = (completedDates, daysOfWeek, refDateStr) => {
  if (daysOfWeek.length === 0 || completedDates.size === 0) return 0
  let best = 0
  let run = 0
  const cursor = new Date(`${refDateStr}T00:00:00`)
  cursor.setTime(cursor.getTime() - LOG_WINDOW_DAYS * DAY_MS)
  const end = new Date(`${refDateStr}T00:00:00`)
  while (cursor.getTime() <= end.getTime()) {
    if (daysOfWeek.includes(cursor.getDay())) {
      if (completedDates.has(toKey(cursor))) {
        run += 1
        if (run > best) best = run
      } else {
        run = 0
      }
    }
    cursor.setTime(cursor.getTime() + DAY_MS)
  }
  return best
}

export const computeCompletionRate30 = (completedDates, daysOfWeek, refDateStr) => {
  if (daysOfWeek.length === 0) return 0
  let scheduled = 0
  let done = 0
  const end = new Date(`${refDateStr}T00:00:00`)
  const cursor = new Date(end)
  cursor.setTime(cursor.getTime() - 29 * DAY_MS)
  while (cursor.getTime() <= end.getTime()) {
    if (daysOfWeek.includes(cursor.getDay())) {
      scheduled += 1
      if (completedDates.has(toKey(cursor))) done += 1
    }
    cursor.setTime(cursor.getTime() + DAY_MS)
  }
  return scheduled === 0 ? 0 : Math.round((done / scheduled) * 100)
}

const decryptHabit = (habit) => {
  const obj = habit.toObject ? habit.toObject() : { ...habit }
  obj.name = decryptField(obj.name)
  return obj
}

const isValidDateKey = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)

export const createHabit = async (req, res) => {
  try {
    const { name, emoji, color, daysOfWeek, reminderTime } = req.body
    const habit = new Habit({
      user: req.user.id,
      name: encryptField(name),
      emoji: emoji || undefined,
      color: color || undefined,
      daysOfWeek: daysOfWeek || undefined,
      reminderTime: reminderTime ?? null,
    })
    await habit.save()
    res.status(201).json(decryptHabit(habit))
  } catch (err) {
    throw err
  }
}

export const getMyHabits = async (req, res) => {
  try {
    const { active, date } = req.query
    const query = { user: req.user.id }
    if (active === "true") query.active = true
    if (active === "false") query.active = false

    const refDateStr =
      isValidDateKey(date) ? date : toKey(new Date())

    const habits = await Habit.find(query).sort({ createdAt: 1 })
    const habitIds = habits.map((h) => h._id)

    const windowStart = new Date(`${refDateStr}T00:00:00`)
    windowStart.setTime(windowStart.getTime() - LOG_WINDOW_DAYS * DAY_MS)
    const windowStartKey = toKey(windowStart)

    const logs = await HabitLog.find({
      user: req.user.id,
      habit: { $in: habitIds },
      date: { $gte: windowStartKey },
    })
      .sort({ date: 1 })
      .lean()

    const totals = await HabitLog.aggregate([
      { $match: { habit: { $in: habitIds } } },
      { $group: { _id: "$habit", count: { $sum: 1 } } },
    ])
    const totalsByHabit = new Map(totals.map((t) => [String(t._id), t.count]))

    const datesByHabit = new Map()
    for (const log of logs) {
      const key = String(log.habit)
      if (!datesByHabit.has(key)) datesByHabit.set(key, new Set())
      datesByHabit.get(key).add(log.date)
    }

    const results = []
    let todayCompleted = 0
    let todayScheduled = 0

    for (const habit of habits) {
      const obj = decryptHabit(habit)
      const completed = datesByHabit.get(String(habit._id)) || new Set()
      const days = obj.daysOfWeek?.length ? obj.daysOfWeek : []

      obj.completedDates = Array.from(completed).sort()
      obj.currentStreak = computeCurrentStreak(completed, days, refDateStr)
      obj.longestStreak = Math.max(
        computeLongestStreak(completed, days, refDateStr),
        obj.currentStreak,
      )
      obj.completionRate30d = computeCompletionRate30(completed, days, refDateStr)
      obj.totalCompletions = totalsByHabit.get(String(habit._id)) || 0

      const scheduledToday = days.includes(new Date(`${refDateStr}T00:00:00`).getDay())
      if (obj.active && scheduledToday) {
        todayScheduled += 1
        if (completed.has(refDateStr)) todayCompleted += 1
      }

      results.push(obj)
    }

    res.json({
      habits: results,
      summary: {
        date: refDateStr,
        todayCompleted,
        todayScheduled,
        activeCount: results.filter((h) => h.active).length,
        bestStreak: results.reduce((max, h) => Math.max(max, h.longestStreak), 0),
      },
    })
  } catch (err) {
    throw err
  }
}

export const updateHabit = async (req, res) => {
  try {
    const habit = await Habit.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!habit) {
      return res.status(404).json({ error: { message: "Habit not found", code: "NOT_FOUND", category: "USER" } })
    }

    const { name, emoji, color, daysOfWeek, reminderTime, active } = req.body

    if (name !== undefined) habit.name = encryptField(name)
    if (emoji !== undefined) habit.emoji = emoji
    if (color !== undefined) habit.color = color
    if (daysOfWeek !== undefined) habit.daysOfWeek = daysOfWeek
    if (reminderTime !== undefined) habit.reminderTime = reminderTime
    if (active !== undefined) {
      habit.active = active
      habit.archivedAt = active ? null : new Date()
    }

    await habit.save()
    res.json(decryptHabit(habit))
  } catch (err) {
    throw err
  }
}

export const deleteHabit = async (req, res) => {
  try {
    const habit = await Habit.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!habit) {
      return res.status(404).json({ error: { message: "Habit not found", code: "NOT_FOUND", category: "USER" } })
    }
    await HabitLog.deleteMany({ habit: habit._id })
    res.json({ message: "Habit deleted" })
  } catch (err) {
    throw err
  }
}

// Check-in toggle for a single calendar day. Completing awards wellness
// points (bounded by the shared daily cap) and companion XP.
export const toggleHabitCheckIn = async (req, res) => {
  try {
    const habit = await Habit.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!habit) {
      return res.status(404).json({ error: { message: "Habit not found", code: "NOT_FOUND", category: "USER" } })
    }

    const { date } = req.body
    const todayKey = toKey(new Date())
    if (date > toKey(new Date(Date.now() + DAY_MS))) {
      return res.status(400).json({ error: { message: "Cannot check in for a future date", code: "VALIDATION_ERROR", category: "USER" } })
    }

    const existing = await HabitLog.findOne({ habit: habit._id, date })

    if (existing) {
      await existing.deleteOne()
      return res.json({
        habitId: String(habit._id),
        date,
        completed: false,
        pointsEarned: 0,
      })
    }

    await HabitLog.create({ user: req.user.id, habit: habit._id, date })

    const pointsEarned = await awardMessagePoints(req.user.id, HABIT_POINTS)
    const pet = await awardPetXp(req.user.id, HABIT_PET_XP)

    res.status(201).json({
      habitId: String(habit._id),
      date,
      completed: true,
      pointsEarned,
      petLeveledUp: pet.leveledUp,
      todayKey,
    })
  } catch (err) {
    throw err
  }
}
