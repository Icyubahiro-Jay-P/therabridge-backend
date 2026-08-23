import { Medication, MedicationLog } from "../models/medication.model.js"
import { encryptField, decryptField } from "../utils/crypto.js"
import User from "../models/user.model.js"
import logger from "../utils/logger.js"

const decryptMedication = (med) => {
  const obj = med.toObject ? med.toObject() : { ...med }
  obj.name = decryptField(obj.name)
  obj.dosage = decryptField(obj.dosage)
  obj.notes = obj.notes ? decryptField(obj.notes) : null
  return obj
}

const decryptLog = (log) => {
  const obj = log.toObject ? log.toObject() : { ...log }
  obj.notes = obj.notes ? decryptField(obj.notes) : null
  return obj
}

export const createMedication = async (req, res) => {
  try {
    const { name, dosage, frequency, timeOfDay, startDate, endDate, notes } = req.body
    const medication = new Medication({
      user: req.user.id,
      name: encryptField(name),
      dosage: encryptField(dosage),
      frequency,
      timeOfDay: timeOfDay || null,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
      active: true,
      notes: notes ? encryptField(notes) : null,
    })
    await medication.save()
    res.status(201).json(decryptMedication(medication))
  } catch (err) {
      throw err
    }
}

export const getMyMedications = async (req, res) => {
  try {
    const { active } = req.query
    const query = { user: req.user.id }
    if (active === "true") query.active = true
    if (active === "false") query.active = false

    const medications = await Medication.find(query).sort({ active: -1, createdAt: -1 })
    res.json({ medications: medications.map(decryptMedication) })
  } catch (err) {
      throw err
    }
}

export const updateMedication = async (req, res) => {
  try {
    const medication = await Medication.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!medication) {
      return res.status(404).json({ error: { message: "Medication not found" } })
    }

    const { name, dosage, frequency, timeOfDay, startDate, endDate, active, notes } = req.body

    if (name !== undefined) medication.name = encryptField(name)
    if (dosage !== undefined) medication.dosage = encryptField(dosage)
    if (frequency !== undefined) medication.frequency = frequency
    if (timeOfDay !== undefined) medication.timeOfDay = timeOfDay
    if (startDate !== undefined) medication.startDate = new Date(startDate)
    if (endDate !== undefined) medication.endDate = endDate ? new Date(endDate) : null
    if (active !== undefined) medication.active = active
    if (notes !== undefined) medication.notes = notes ? encryptField(notes) : null

    await medication.save()
    res.json(decryptMedication(medication))
  } catch (err) {
      throw err
    }
}

export const deleteMedication = async (req, res) => {
  try {
    const medication = await Medication.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!medication) {
      return res.status(404).json({ error: { message: "Medication not found" } })
    }
    await MedicationLog.deleteMany({ medication: medication._id })
    res.json({ message: "Medication deleted" })
  } catch (err) {
      throw err
    }
}

export const logDose = async (req, res) => {
  try {
    const { medicationId, takenAt, skipped, sideEffects, notes } = req.body

    const medication = await Medication.findOne({
      _id: medicationId,
      user: req.user.id,
    })
    if (!medication) {
      return res.status(404).json({ error: { message: "Medication not found" } })
    }

    const log = new MedicationLog({
      user: req.user.id,
      medication: medication._id,
      takenAt: takenAt ? new Date(takenAt) : new Date(),
      skipped: skipped || false,
      sideEffects: sideEffects || [],
      notes: notes ? encryptField(notes) : null,
    })
    await log.save()

    // Award 2 talking points
    const user = await User.findById(req.user.id)
    if (user) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const pointsDate = user.talkingPointsDate ? new Date(user.talkingPointsDate) : null
      if (pointsDate) {
        pointsDate.setHours(0, 0, 0, 0)
        if (pointsDate.getTime() < today.getTime()) {
          user.talkingPointsToday = 2
        } else {
          user.talkingPointsToday = (user.talkingPointsToday || 0) + 2
        }
      } else {
        user.talkingPointsToday = 2
      }
      user.talkingPointsDate = today
      await user.save()
    }

    res.status(201).json(decryptLog(log))
  } catch (err) {
      throw err
    }
}

export const getMyLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, medicationId } = req.query
    const query = { user: req.user.id }
    if (medicationId) query.medication = medicationId

    const skip = (Number(page) - 1) * Number(limit)
    let logs = await MedicationLog.find(query)
      .populate("medication", "name dosage frequency")
      .sort({ takenAt: -1 })
      .skip(skip)
      .limit(Number(limit) + 1)

    const hasMore = logs.length > Number(limit)
    if (hasMore) logs = logs.slice(0, Number(limit))

    res.json({ logs: logs.map(decryptLog), hasMore })
  } catch (err) {
      throw err
    }
}

export const getAdherenceStats = async (req, res) => {
  try {
    const { medicationId, days = 30 } = req.query
    const since = new Date()
    since.setDate(since.getDate() - Number(days))
    since.setHours(0, 0, 0, 0)

    const query = { user: req.user.id, takenAt: { $gte: since } }
    if (medicationId) query.medication = medicationId

    const logs = await MedicationLog.find(query).sort({ takenAt: 1 })

    // Total scheduled days
    const totalDays = Number(days)

    // Days with at least one taken dose (not skipped)
    const takenDays = new Set()
    const skippedDays = new Set()
    const sideEffectCounts = {}
    let totalDoses = 0
    let takenDoses = 0

    for (const log of logs) {
      const dayKey = new Date(log.takenAt).toISOString().slice(0, 10)
      totalDoses++
      if (log.skipped) {
        skippedDays.add(dayKey)
      } else {
        takenDoses++
        takenDays.add(dayKey)
      }

      for (const effect of log.sideEffects || []) {
        sideEffectCounts[effect] = (sideEffectCounts[effect] || 0) + 1
      }
    }

    const adherenceRate = totalDoses > 0
      ? Math.round((takenDoses / totalDoses) * 100)
      : 0

    // Build top side effects
    const sideEffects = Object.entries(sideEffectCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Current streak: consecutive days with taken doses ending today
    const allTakenDates = Array.from(takenDays).sort().reverse()
    let streak = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let checkDate = new Date(today)

    for (let i = 0; i <= totalDays; i++) {
      const dayKey = checkDate.toISOString().slice(0, 10)
      if (allTakenDates.includes(dayKey)) {
        streak++
      } else if (i > 0) {
        break
      }
      checkDate.setDate(checkDate.getDate() - 1)
    }

    // Build taken days map for calendar
    const takenDaysMap = {}
    for (const dayKey of takenDays) {
      takenDaysMap[dayKey] = true
    }

    res.json({
      adherenceRate,
      totalDoses,
      takenDoses,
      sideEffects,
      streak,
      takenDaysMap,
    })
  } catch (err) {
      throw err
    }
}
