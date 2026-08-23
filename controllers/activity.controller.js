import Activity from "../models/activity.model.js"
import { encryptField, decryptField } from "../utils/crypto.js"
import logger from "../utils/logger.js"
import { awardMessagePoints } from "../utils/points.js"

const decryptActivity = (activity) => {
  const obj = activity.toObject()
  obj.title = decryptField(obj.title)
  obj.notes = decryptField(obj.notes)
  return obj
}

export const createActivity = async (req, res) => {
  try {
    const { title, category, scheduledDate, scheduledTime, duration, expectedPleasure, moodBefore, notes } = req.body

    const activity = new Activity({
      user: req.user.id,
      title: encryptField(title),
      category,
      scheduledDate: new Date(scheduledDate),
      scheduledTime: scheduledTime || null,
      duration: duration || null,
      expectedPleasure,
      moodBefore: moodBefore || null,
      notes: notes ? encryptField(notes) : undefined,
    })

    await activity.save()
    res.status(201).json(decryptActivity(activity))
  } catch (err) {
      throw err
    }
}

export const getMyActivities = async (req, res) => {
  try {
    const { week, completed, category } = req.query
    const query = { user: req.user.id }

    if (week) {
      const start = new Date(week)
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      query.scheduledDate = { $gte: start, $lt: end }
    }

    if (completed !== undefined) {
      query.completed = completed === "true"
    }

    if (category) {
      query.category = category
    }

    const activities = await Activity.find(query)
      .sort({ scheduledDate: 1 })

    const results = activities.map(decryptActivity)
    res.json({ activities: results })
  } catch (err) {
      throw err
    }
}

export const getActivity = async (req, res) => {
  try {
    const activity = await Activity.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!activity) {
      return res.status(404).json({ error: { message: "Activity not found", code: "NOT_FOUND", category: "USER" } })
    }
    res.json(decryptActivity(activity))
  } catch (err) {
      throw err
    }
}

export const updateActivity = async (req, res) => {
  try {
    const activity = await Activity.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!activity) {
      return res.status(404).json({ error: { message: "Activity not found", code: "NOT_FOUND", category: "USER" } })
    }

    const plainFields = ["category", "scheduledDate", "scheduledTime", "duration", "expectedPleasure", "actualPleasure", "completed", "completedAt", "moodBefore", "moodAfter"]
    const encryptedFields = ["title", "notes"]

    for (const f of encryptedFields) {
      if (req.body[f] !== undefined) activity[f] = encryptField(req.body[f])
    }
    for (const f of plainFields) {
      if (req.body[f] !== undefined) activity[f] = req.body[f]
    }

    if (req.body.completed && !activity.completedAt) {
      activity.completedAt = new Date()
    }

    await activity.save()
    res.json(decryptActivity(activity))
  } catch (err) {
      throw err
    }
}

export const completeActivity = async (req, res) => {
  try {
    const { actualPleasure, moodAfter, notes } = req.body
    const activity = await Activity.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!activity) {
      return res.status(404).json({ error: { message: "Activity not found", code: "NOT_FOUND", category: "USER" } })
    }

    activity.completed = true
    activity.completedAt = new Date()
    if (actualPleasure !== undefined) activity.actualPleasure = actualPleasure
    if (moodAfter) activity.moodAfter = moodAfter
    if (notes) activity.notes = encryptField(notes)

    await activity.save()

    const pointsEarned = await awardMessagePoints(req.user.id, 3)
    res.json({ ...decryptActivity(activity), pointsEarned })
  } catch (err) {
      throw err
    }
}

export const deleteActivity = async (req, res) => {
  try {
    const activity = await Activity.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!activity) {
      return res.status(404).json({ error: { message: "Activity not found", code: "NOT_FOUND", category: "USER" } })
    }
    res.json({ message: "Activity deleted" })
  } catch (err) {
      throw err
    }
}

export const getStats = async (req, res) => {
  try {
    const userId = req.user.id
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [totalActivities, completedActivities, categoryBreakdown, avgPleasure] = await Promise.all([
      Activity.countDocuments({ user: userId, scheduledDate: { $gte: thirtyDaysAgo } }),
      Activity.countDocuments({ user: userId, completed: true, scheduledDate: { $gte: thirtyDaysAgo } }),
      Activity.aggregate([
        { $match: { user: userId, scheduledDate: { $gte: thirtyDaysAgo } } },
        { $group: { _id: "$category", total: { $sum: 1 }, completed: { $sum: { $cond: ["$completed", 1, 0] } } } },
        { $sort: { total: -1 } },
      ]),
      Activity.aggregate([
        { $match: { user: userId, actualPleasure: { $exists: true, $ne: null }, scheduledDate: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, avg: { $avg: "$actualPleasure" } } },
      ]),
    ])

    res.json({
      totalActivities,
      completedActivities,
      completionRate: totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0,
      categoryBreakdown: categoryBreakdown.map((c) => ({
        category: c._id,
        total: c.total,
        completed: c.completed,
      })),
      avgPleasure: avgPleasure[0]?.avg ? Math.round(avgPleasure[0].avg * 10) / 10 : null,
    })
  } catch (err) {
      throw err
    }
}
