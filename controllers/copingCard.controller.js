import CopingCard from "../models/copingCard.model.js"
import { encryptField, decryptField } from "../utils/crypto.js"
import { awardMessagePoints } from "../utils/points.js"
import logger from "../utils/logger.js"

const COPING_CARD_TEMPLATES = [
  // Anxiety Coping
  { text: "This feeling is temporary. It will pass.", category: "anxiety_coping" },
  { text: "I am safe right now.", category: "anxiety_coping" },
  { text: "I can handle uncertainty.", category: "anxiety_coping" },
  { text: "I don't need to have all the answers today.", category: "anxiety_coping" },
  // Self-Compassion
  { text: "I am doing the best I can.", category: "self_compassion" },
  { text: "I deserve kindness, especially from myself.", category: "self_compassion" },
  { text: "It's okay to not be okay.", category: "self_compassion" },
  { text: "I am enough just as I am.", category: "self_compassion" },
  // Motivation
  { text: "Every small step counts.", category: "motivation" },
  { text: "Progress, not perfection.", category: "motivation" },
  { text: "I am capable of hard things.", category: "motivation" },
  // Crisis Survival
  { text: "I have survived 100% of my worst days.", category: "crisis_survival" },
  { text: "This moment will pass.", category: "crisis_survival" },
  { text: "I am not alone in this.", category: "crisis_survival" },
  // Gratitude
  { text: "I am grateful for...", category: "gratitude" },
  { text: "There is always something good in my day.", category: "gratitude" },
  // Encouragement
  { text: "I am growing stronger every day.", category: "encouragement" },
  { text: "I believe in my ability to get through this.", category: "encouragement" },
]

const ensureTemplates = async () => {
  const count = await CopingCard.countDocuments({ isTemplate: true })
  if (count >= COPING_CARD_TEMPLATES.length) return

  const existing = await CopingCard.find({ isTemplate: true })
    .select("text category")
    .lean()
  const existingSet = new Set(existing.map((e) => `${e.text}::${e.category}`))

  const toInsert = COPING_CARD_TEMPLATES
    .filter((t) => !existingSet.has(`${t.text}::${t.category}`))
    .map((t) => ({
      user: "000000000000000000000000",
      text: encryptField(t.text),
      category: t.category,
      isFavorite: false,
      isTemplate: true,
    }))

  if (toInsert.length > 0) {
    await CopingCard.insertMany(toInsert, { ordered: false }).catch(() => {})
  }
}

const decryptCard = (card) => {
  const obj = card.toObject()
  obj.text = decryptField(obj.text)
  return obj
}

export const createCard = async (req, res) => {
  try {
    const { text, category } = req.body
    const card = new CopingCard({
      user: req.user.id,
      text: encryptField(text),
      category,
      isFavorite: false,
      isTemplate: false,
    })
    await card.save()
    const pointsEarned = await awardMessagePoints(req.user.id, 2)
    res.status(201).json({ ...decryptCard(card), pointsEarned })
  } catch (err) {
    logger.error({ err }, "failed to create coping card")
    res.status(500).json({ error: { message: "Failed to create coping card" } })
  }
}

export const getMyCards = async (req, res) => {
  try {
    await ensureTemplates()

    const { category } = req.query
    const query = {
      $or: [
        { user: req.user.id },
        { isTemplate: true },
      ],
    }
    if (category) query.category = category

    const cards = await CopingCard.find(query)
      .sort({ isTemplate: -1, isFavorite: -1, createdAt: -1 })

    res.json({ cards: cards.map(decryptCard) })
  } catch (err) {
    logger.error({ err }, "failed to get coping cards")
    res.status(500).json({ error: { message: "Failed to get coping cards" } })
  }
}

export const toggleFavorite = async (req, res) => {
  try {
    const card = await CopingCard.findOne({
      _id: req.params.id,
      $or: [
        { user: req.user.id },
        { isTemplate: true },
      ],
    })
    if (!card) {
      return res.status(404).json({ error: { message: "Card not found" } })
    }

    card.isFavorite = !card.isFavorite
    await card.save()
    res.json(decryptCard(card))
  } catch (err) {
    logger.error({ err }, "failed to toggle favorite")
    res.status(500).json({ error: { message: "Failed to toggle favorite" } })
  }
}

export const deleteCard = async (req, res) => {
  try {
    const card = await CopingCard.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!card) {
      return res.status(404).json({ error: { message: "Card not found" } })
    }
    if (card.isTemplate) {
      return res.status(403).json({ error: { message: "Templates cannot be deleted" } })
    }

    await card.deleteOne()
    res.json({ message: "Card deleted" })
  } catch (err) {
    logger.error({ err }, "failed to delete coping card")
    res.status(500).json({ error: { message: "Failed to delete coping card" } })
  }
}
