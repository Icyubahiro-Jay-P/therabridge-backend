import ThoughtRecord from "../models/thoughtRecord.model.js"
import { encryptField, decryptField } from "../utils/crypto.js"
import logger from "../utils/logger.js"
import { awardThoughtRecordPoints } from "../utils/points.js"

const decryptRecord = (record) => {
  const obj = record.toObject()
  obj.situation = decryptField(obj.situation)
  obj.automaticThought = decryptField(obj.automaticThought)
  obj.emotions = decryptField(obj.emotions)
  obj.evidenceFor = decryptField(obj.evidenceFor)
  obj.evidenceAgainst = decryptField(obj.evidenceAgainst)
  obj.reframe = decryptField(obj.reframe)
  obj.outcomeEmotion = decryptField(obj.outcomeEmotion)
  return obj
}

export const createRecord = async (req, res) => {
  try {
    const {
      situation, automaticThought, emotions, emotionIntensity,
      distortionType, evidenceFor, evidenceAgainst, reframe,
      outcomeEmotion, outcomeIntensity, mood,
    } = req.body

    const record = new ThoughtRecord({
      user: req.user.id,
      situation: encryptField(situation),
      automaticThought: encryptField(automaticThought),
      emotions: encryptField(emotions),
      emotionIntensity,
      distortionType: distortionType || "none",
      evidenceFor: evidenceFor ? encryptField(evidenceFor) : undefined,
      evidenceAgainst: evidenceAgainst ? encryptField(evidenceAgainst) : undefined,
      reframe: encryptField(reframe),
      outcomeEmotion: outcomeEmotion ? encryptField(outcomeEmotion) : undefined,
      outcomeIntensity: outcomeIntensity || undefined,
      mood: mood || null,
    })

    await record.save()

    const pointsEarned = await awardThoughtRecordPoints(req.user.id)
    res.status(201).json({ ...decryptRecord(record), pointsEarned })
  } catch (err) {
    logger.error({ err }, "failed to create thought record")
    res.status(500).json({ error: { message: "Failed to create thought record" } })
  }
}

export const getMyRecords = async (req, res) => {
  try {
    const { page = 1, limit = 20, distortion, mood, search } = req.query
    const query = { user: req.user.id }
    if (distortion) query.distortionType = distortion
    if (mood) query.mood = mood

    const skip = (Number(page) - 1) * Number(limit)
    let records = await ThoughtRecord.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit) + 1)

    const hasMore = records.length > Number(limit)
    if (hasMore) records = records.slice(0, Number(limit))

    let results = records.map(decryptRecord)

    if (search) {
      const q = search.toLowerCase()
      results = results.filter(
        (r) =>
          r.situation.toLowerCase().includes(q) ||
          r.automaticThought.toLowerCase().includes(q) ||
          r.reframe.toLowerCase().includes(q),
      )
    }

    res.json({ records: results, hasMore })
  } catch (err) {
    logger.error({ err }, "failed to get thought records")
    res.status(500).json({ error: { message: "Failed to get thought records" } })
  }
}

export const getRecord = async (req, res) => {
  try {
    const record = await ThoughtRecord.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!record) {
      return res.status(404).json({ error: { message: "Thought record not found" } })
    }
    res.json(decryptRecord(record))
  } catch (err) {
    logger.error({ err }, "failed to get thought record")
    res.status(500).json({ error: { message: "Failed to get thought record" } })
  }
}

export const updateRecord = async (req, res) => {
  try {
    const record = await ThoughtRecord.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!record) {
      return res.status(404).json({ error: { message: "Thought record not found" } })
    }

    const fields = [
      "situation", "automaticThought", "emotions", "evidenceFor",
      "evidenceAgainst", "reframe", "outcomeEmotion",
    ]
    for (const f of fields) {
      if (req.body[f] !== undefined) record[f] = encryptField(req.body[f])
    }

    const plainFields = [
      "emotionIntensity", "distortionType", "outcomeIntensity", "mood",
    ]
    for (const f of plainFields) {
      if (req.body[f] !== undefined) record[f] = req.body[f]
    }

    await record.save()
    res.json(decryptRecord(record))
  } catch (err) {
    logger.error({ err }, "failed to update thought record")
    res.status(500).json({ error: { message: "Failed to update thought record" } })
  }
}

export const deleteRecord = async (req, res) => {
  try {
    const record = await ThoughtRecord.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!record) {
      return res.status(404).json({ error: { message: "Thought record not found" } })
    }
    res.json({ message: "Thought record deleted" })
  } catch (err) {
    logger.error({ err }, "failed to delete thought record")
    res.status(500).json({ error: { message: "Failed to delete thought record" } })
  }
}

export const getStats = async (req, res) => {
  try {
    const userId = req.user.id
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [totalRecords, distortionCounts, avgBefore, avgAfter, recentRecords] =
      await Promise.all([
        ThoughtRecord.countDocuments({ user: userId }),
        ThoughtRecord.aggregate([
          { $match: { user: userId, createdAt: { $gte: thirtyDaysAgo } } },
          { $group: { _id: "$distortionType", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
        ThoughtRecord.aggregate([
          { $match: { user: userId, createdAt: { $gte: thirtyDaysAgo } } },
          { $group: { _id: null, avg: { $avg: "$emotionIntensity" } } },
        ]),
        ThoughtRecord.aggregate([
          { $match: { user: userId, outcomeIntensity: { $exists: true, $ne: null }, createdAt: { $gte: thirtyDaysAgo } } },
          { $group: { _id: null, avg: { $avg: "$outcomeIntensity" } } },
        ]),
        ThoughtRecord.countDocuments({
          user: userId,
          createdAt: { $gte: thirtyDaysAgo },
        }),
      ])

    res.json({
      totalRecords,
      recentRecords,
      distortionBreakdown: distortionCounts.map((d) => ({
        type: d._id,
        count: d.count,
      })),
      avgEmotionBefore: avgBefore[0]?.avg ? Math.round(avgBefore[0].avg * 10) / 10 : null,
      avgEmotionAfter: avgAfter[0]?.avg ? Math.round(avgAfter[0].avg * 10) / 10 : null,
    })
  } catch (err) {
    logger.error({ err }, "failed to get thought record stats")
    res.status(500).json({ error: { message: "Failed to get stats" } })
  }
}
