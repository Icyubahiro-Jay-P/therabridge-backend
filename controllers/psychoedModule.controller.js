import { PsychoedModule, PsychoedProgress } from "../models/psychoedModule.model.js"
import logger from "../utils/logger.js"

export const getModules = async (req, res) => {
  try {
    const modules = await PsychoedModule.find().sort({ category: 1, order: 1 })
    const progress = await PsychoedProgress.find({ user: req.user.id })
    const progressMap = new Map(progress.map((p) => [p.module.toString(), p]))

    const result = modules.map((mod) => {
      const p = progressMap.get(mod._id.toString())
      return {
        _id: mod._id,
        title: mod.title,
        description: mod.description,
        category: mod.category,
        stepCount: mod.steps.length,
        order: mod.order,
        progress: p
          ? {
              currentStepIndex: p.currentStepIndex,
              completedSteps: p.completedSteps,
              completed: p.completed,
              completedAt: p.completedAt,
            }
          : null,
      }
    })

    res.json({ modules: result })
  } catch (err) {
      throw err
    }
}

export const getModule = async (req, res) => {
  try {
    const mod = await PsychoedModule.findById(req.params.id)
    if (!mod) {
      return res.status(404).json({ error: { message: "Module not found" } })
    }

    const progress = await PsychoedProgress.findOne({
      user: req.user.id,
      module: mod._id,
    })

    res.json({
      module: mod.toObject(),
      progress: progress
        ? {
            currentStepIndex: progress.currentStepIndex,
            completedSteps: progress.completedSteps,
            completed: progress.completed,
            completedAt: progress.completedAt,
            startedAt: progress.startedAt,
          }
        : null,
    })
  } catch (err) {
      throw err
    }
}

export const startModule = async (req, res) => {
  try {
    const mod = await PsychoedModule.findById(req.params.id)
    if (!mod) {
      return res.status(404).json({ error: { message: "Module not found" } })
    }

    const existing = await PsychoedProgress.findOne({
      user: req.user.id,
      module: mod._id,
    })
    if (existing) {
      return res.json({
        currentStepIndex: existing.currentStepIndex,
        completedSteps: existing.completedSteps,
        completed: existing.completed,
        completedAt: existing.completedAt,
        startedAt: existing.startedAt,
      })
    }

    const progress = await PsychoedProgress.create({
      user: req.user.id,
      module: mod._id,
      currentStepIndex: 0,
      completedSteps: [],
    })

    res.status(201).json({
      currentStepIndex: progress.currentStepIndex,
      completedSteps: progress.completedSteps,
      completed: progress.completed,
      startedAt: progress.startedAt,
    })
  } catch (err) {
      throw err
    }
}

export const completeStep = async (req, res) => {
  try {
    const mod = await PsychoedModule.findById(req.params.id)
    if (!mod) {
      return res.status(404).json({ error: { message: "Module not found" } })
    }

    const { stepIndex } = req.body
    if (typeof stepIndex !== "number" || stepIndex < 0 || stepIndex >= mod.steps.length) {
      return res.status(400).json({ error: { message: "Invalid step index" } })
    }

    let progress = await PsychoedProgress.findOne({
      user: req.user.id,
      module: mod._id,
    })
    if (!progress) {
      progress = await PsychoedProgress.create({
        user: req.user.id,
        module: mod._id,
        currentStepIndex: 0,
        completedSteps: [],
      })
    }

    if (!progress.completedSteps.includes(stepIndex)) {
      progress.completedSteps.push(stepIndex)
      progress.completedSteps.sort((a, b) => a - b)
    }

    if (stepIndex >= progress.currentStepIndex) {
      progress.currentStepIndex = Math.min(stepIndex + 1, mod.steps.length)
    }

    const allDone = progress.completedSteps.length === mod.steps.length
    if (allDone && !progress.completed) {
      progress.completed = true
      progress.completedAt = new Date()
    }

    await progress.save()

    res.json({
      currentStepIndex: progress.currentStepIndex,
      completedSteps: progress.completedSteps,
      completed: progress.completed,
      completedAt: progress.completedAt,
    })
  } catch (err) {
      throw err
    }
}

export const getMyProgress = async (req, res) => {
  try {
    const progress = await PsychoedProgress.find({ user: req.user.id })
      .populate("module", "title description category stepCount")
      .sort({ updatedAt: -1 })

    const inProgress = progress.filter((p) => !p.completed)
    const completed = progress.filter((p) => p.completed)

    res.json({ inProgress, completed })
  } catch (err) {
      throw err
    }
}
