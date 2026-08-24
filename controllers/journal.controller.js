import JournalEntry from "../models/journal.model.js"
import { encryptField, decryptField } from "../utils/crypto.js"
import { awardMessagePoints } from "../utils/points.js"
import { awardPetXp } from "../utils/petXp.js"
import logger from "../utils/logger.js"

const JOURNAL_POINTS = 3
const JOURNAL_PET_XP = 5

const decryptEntry = (entry) => {
  const obj = entry.toObject()
  obj.title = decryptField(obj.title)
  obj.content = decryptField(obj.content)
  if (obj.comments) {
    obj.comments = obj.comments.map((c) => ({
      ...c,
      content: decryptField(c.content),
    }))
  }
  return obj
}

export const createEntry = async (req, res) => {
  try {
    const { title, content, mood, tags, isPublic } = req.body
    const entry = new JournalEntry({
      user: req.user.id,
      title: encryptField(title),
      content: encryptField(content),
      mood: mood || null,
      tags: tags || [],
      isPublic: isPublic || false,
    })
    await entry.save()

    // Points on every entry (bounded by the shared daily cap); pet XP only on
    // the first entry of the day so one writing session can't be farmed.
    const pointsEarned = await awardMessagePoints(req.user.id, JOURNAL_POINTS)

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const todaysCount = await JournalEntry.countDocuments({
      user: req.user.id,
      createdAt: { $gte: startOfToday },
    })
    if (todaysCount <= 1) {
      await awardPetXp(req.user.id, JOURNAL_PET_XP)
    }

    res.status(201).json({ ...decryptEntry(entry), pointsEarned })
  } catch (err) {
      throw err
    }
}

export const getMyEntries = async (req, res) => {
  try {
    const { page = 1, limit = 20, mood, tag, search } = req.query
    const query = { user: req.user.id }
    if (mood) query.mood = mood
    if (tag) query.tags = tag
    if (search) {
      // Search is done post-decryption since content is encrypted
      // We'll fetch more and filter in memory
    }

    const skip = (Number(page) - 1) * Number(limit)
    let entries = await JournalEntry.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit) + 1)

    const hasMore = entries.length > Number(limit)
    if (hasMore) entries = entries.slice(0, Number(limit))

    let results = entries.map(decryptEntry)

    if (search) {
      const q = search.toLowerCase()
      results = results.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.content.toLowerCase().includes(q),
      )
    }

    res.json({ entries: results, hasMore })
  } catch (err) {
      throw err
    }
}

export const getEntry = async (req, res) => {
  try {
    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!entry) {
      return res.status(404).json({ error: { message: "Journal entry not found", code: "NOT_FOUND", category: "USER" } })
    }
    res.json(decryptEntry(entry))
  } catch (err) {
      throw err
    }
}

export const updateEntry = async (req, res) => {
  try {
    const { title, content, mood, tags, isPublic } = req.body
    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!entry) {
      return res.status(404).json({ error: { message: "Journal entry not found", code: "NOT_FOUND", category: "USER" } })
    }

    if (title !== undefined) entry.title = encryptField(title)
    if (content !== undefined) entry.content = encryptField(content)
    if (mood !== undefined) entry.mood = mood
    if (tags !== undefined) entry.tags = tags
    if (isPublic !== undefined) entry.isPublic = isPublic

    await entry.save()
    res.json(decryptEntry(entry))
  } catch (err) {
      throw err
    }
}

export const deleteEntry = async (req, res) => {
  try {
    const entry = await JournalEntry.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!entry) {
      return res.status(404).json({ error: { message: "Journal entry not found", code: "NOT_FOUND", category: "USER" } })
    }
    res.json({ message: "Journal entry deleted" })
  } catch (err) {
      throw err
    }
}

export const addComment = async (req, res) => {
  try {
    const { content } = req.body
    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!entry) {
      return res.status(404).json({ error: { message: "Journal entry not found", code: "NOT_FOUND", category: "USER" } })
    }

    entry.comments.push({
      author: req.user.id,
      content: encryptField(content),
    })
    await entry.save()

    const updated = decryptEntry(entry)
    const comment = updated.comments[updated.comments.length - 1]
    res.status(201).json(comment)
  } catch (err) {
      throw err
    }
}

export const deleteComment = async (req, res) => {
  try {
    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!entry) {
      return res.status(404).json({ error: { message: "Journal entry not found", code: "NOT_FOUND", category: "USER" } })
    }

    const comment = entry.comments.id(req.params.commentId)
    if (!comment) {
      return res.status(404).json({ error: { message: "Comment not found", code: "NOT_FOUND", category: "USER" } })
    }

    // Only the comment author or entry owner can delete
    if (
      comment.author.toString() !== req.user.id &&
      entry.user.toString() !== req.user.id
    ) {
      return res.status(403).json({ error: { message: "Not authorized", code: "FORBIDDEN", category: "USER" } })
    }

    comment.deleteOne()
    await entry.save()

    res.json({ message: "Comment deleted" })
  } catch (err) {
      throw err
    }
}

export const getPublicEntries = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    let entries = await JournalEntry.find({ isPublic: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit) + 1)
      .populate("user", "firstName lastName username avatar")

    const hasMore = entries.length > Number(limit)
    if (hasMore) entries = entries.slice(0, Number(limit))

    const results = entries.map((e) => {
      const obj = decryptEntry(e)
      if (obj.user) {
        obj.user = {
          id: obj.user._id,
          firstName: obj.user.firstName,
          lastName: obj.user.lastName,
          username: obj.user.username,
          avatar: obj.user.avatar,
        }
      }
      return obj
    })

    res.json({ entries: results, hasMore })
  } catch (err) {
      throw err
    }
}
