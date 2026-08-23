import GratitudeEntry from "../models/gratitude.model.js"
import { encryptField, decryptField } from "../utils/crypto.js"
import logger from "../utils/logger.js"
import { awardMessagePoints } from "../utils/points.js"

const GRATITUDE_PROMPTS = [
  { id: "g1", text: "What made you smile today?" },
  { id: "g2", text: "Who is someone you're grateful for and why?" },
  { id: "g3", text: "What's a skill or ability you're thankful to have?" },
  { id: "g4", text: "Describe a small moment that brought you joy recently." },
  { id: "g5", text: "What's something in nature you appreciate?" },
  { id: "g6", text: "What's a challenge that helped you grow?" },
  { id: "g7", text: "What's a comfort you often take for granted?" },
  { id: "g8", text: "Who showed you kindness recently?" },
  { id: "g9", text: "What's something about your home you're grateful for?" },
  { id: "g10", text: "What's a memory that always lifts your spirits?" },
  { id: "g11", text: "What's something you learned recently that you appreciate?" },
  { id: "g12", text: "What's a piece of music or art that moves you?" },
  { id: "g13", text: "What's a food or meal you're thankful for?" },
  { id: "g14", text: "What's one thing going well in your life right now?" },
  { id: "g15", text: "What's a relationship quality you value?" },
  { id: "g16", text: "What's something about today's weather you enjoyed?" },
  { id: "g17", text: "What's a tool or technology that makes your life easier?" },
  { id: "g18", text: "What's something your body did for you today?" },
  { id: "g19", text: "What's a kindness you witnessed recently?" },
  { id: "g20", text: "What's one thing you're looking forward to?" },
  { id: "g21", text: "What's something about yourself you're proud of?" },
  { id: "g22", text: "What's a place that feels special to you?" },
  { id: "g23", text: "What's a book, show, or movie that impacted you positively?" },
  { id: "g24", text: "What's a holiday or celebration you're grateful for?" },
  { id: "g25", text: "What's a way someone helped you this week?" },
  { id: "g26", text: "What's something about this season you appreciate?" },
  { id: "g27", text: "What's a sound or smell that brings you comfort?" },
  { id: "g28", text: "What's a routine or habit that serves you well?" },
  { id: "g29", text: "What's something about the present moment you can savor?" },
  { id: "g30", text: "What's one thing you'd put on a gratitude list today?" },
]

const decryptEntry = (entry) => {
  const obj = entry.toObject()
  obj.content = decryptField(obj.content)
  return obj
}

export const getDailyPrompt = async (req, res) => {
  try {
    const today = new Date()
    const dayOfYear = Math.floor(
      (today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24),
    )
    const prompt = GRATITUDE_PROMPTS[dayOfYear % GRATITUDE_PROMPTS.length]

    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const existingToday = await GratitudeEntry.findOne({
      user: req.user.id,
      promptId: prompt.id,
      createdAt: { $gte: todayStart },
    })

    res.json({ prompt, hasEntryToday: !!existingToday })
  } catch (err) {
      throw err
    }
}

export const createEntry = async (req, res) => {
  try {
    const { promptId, promptText, content } = req.body

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const existingToday = await GratitudeEntry.findOne({
      user: req.user.id,
      promptId,
      createdAt: { $gte: todayStart },
    })

    if (existingToday) {
      // Completing the daily prompt twice is a normal repeat visit, not an
      // error - hand back the existing entry so the UI can show it.
      return res.status(200).json({ ...decryptEntry(existingToday), alreadyCompleted: true, pointsEarned: 0 })
    }

    const entry = new GratitudeEntry({
      user: req.user.id,
      promptId,
      promptText,
      content: encryptField(content),
    })

    await entry.save()

    const pointsEarned = await awardMessagePoints(req.user.id, 3)
    res.status(201).json({ ...decryptEntry(entry), pointsEarned })
  } catch (err) {
      throw err
    }
}

export const getMyEntries = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    let entries = await GratitudeEntry.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit) + 1)

    const hasMore = entries.length > Number(limit)
    if (hasMore) entries = entries.slice(0, Number(limit))

    const results = entries.map(decryptEntry)
    res.json({ entries: results, hasMore })
  } catch (err) {
      throw err
    }
}

export const getStreak = async (req, res) => {
  try {
    const entries = await GratitudeEntry.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .select("createdAt")

    let streak = 0
    let currentDate = new Date()
    currentDate.setHours(0, 0, 0, 0)

    const dates = entries.map((e) => {
      const d = new Date(e.createdAt)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    })

    const uniqueDates = [...new Set(dates)].sort((a, b) => b - a)

    for (let i = 0; i < uniqueDates.length; i++) {
      const expectedDate = new Date(currentDate)
      expectedDate.setDate(expectedDate.getDate() - i)
      expectedDate.setHours(0, 0, 0, 0)

      if (uniqueDates[i] === expectedDate.getTime()) {
        streak++
      } else {
        break
      }
    }

    res.json({ streak, totalEntries: await GratitudeEntry.countDocuments({ user: req.user.id }) })
  } catch (err) {
      throw err
    }
}

export const deleteEntry = async (req, res) => {
  try {
    const entry = await GratitudeEntry.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!entry) {
      return res.status(404).json({ error: { message: "Entry not found", code: "NOT_FOUND", category: "USER" } })
    }
    res.json({ message: "Entry deleted" })
  } catch (err) {
      throw err
    }
}
