import Assessment from "../models/assessment.model.js"
import logger from "../utils/logger.js"

const SCORING = {
  phq9: {
    name: "Patient Health Questionnaire (PHQ-9)",
    description: "Screens for depression severity over the past 2 weeks",
    questions: 9,
    maxScore: 27,
    severity(score) {
      if (score <= 4) return "minimal"
      if (score <= 9) return "mild"
      if (score <= 14) return "moderate"
      if (score <= 19) return "moderately_severe"
      return "severe"
    },
    severityLabel(severity) {
      const labels = {
        minimal: "Minimal Depression",
        mild: "Mild Depression",
        moderate: "Moderate Depression",
        moderately_severe: "Moderately Severe Depression",
        severe: "Severe Depression",
      }
      return labels[severity] || severity
    },
  },
  gad7: {
    name: "Generalized Anxiety Disorder (GAD-7)",
    description: "Screens for generalized anxiety over the past 2 weeks",
    questions: 7,
    maxScore: 21,
    severity(score) {
      if (score <= 4) return "minimal"
      if (score <= 9) return "mild"
      if (score <= 14) return "moderate"
      return "severe"
    },
    severityLabel(severity) {
      const labels = {
        minimal: "Minimal Anxiety",
        mild: "Mild Anxiety",
        moderate: "Moderate Anxiety",
        severe: "Severe Anxiety",
      }
      return labels[severity] || severity
    },
  },
  pss: {
    name: "Perceived Stress Scale (PSS-10)",
    description: "Measures perceived stress over the past month",
    questions: 10,
    maxScore: 40,
    severity(score) {
      if (score <= 13) return "minimal"
      if (score <= 26) return "mild"
      return "severe"
    },
    severityLabel(severity) {
      const labels = {
        minimal: "Low Perceived Stress",
        mild: "Moderate Perceived Stress",
        severe: "High Perceived Stress",
      }
      return labels[severity] || severity
    },
  },
  k10: {
    name: "Kessler Psychological Distress (K10)",
    description: "Measures non-specific psychological distress",
    questions: 10,
    maxScore: 50,
    severity(score) {
      if (score <= 15) return "minimal"
      if (score <= 21) return "mild"
      if (score <= 29) return "moderate"
      return "severe"
    },
    severityLabel(severity) {
      const labels = {
        minimal: "Low Distress",
        mild: "Moderate Distress",
        moderate: "High Distress",
        severe: "Very High Distress",
      }
      return labels[severity] || severity
    },
  },
}

export const ASSESSMENT_TYPES = SCORING

export const takeAssessment = async (req, res) => {
  try {
    const { type, responses } = req.body
    const config = SCORING[type]
    if (!config) {
      return res.status(400).json({ error: { message: "Invalid assessment type", code: "VALIDATION_ERROR", category: "USER" } })
    }

    if (responses.length !== config.questions) {
      return res.status(400).json({
        error: { message: `Expected ${config.questions} responses for ${type}`, code: "VALIDATION_ERROR", category: "USER" },
      })
    }

    const score = responses.reduce((sum, r) => sum + r.value, 0)
    const severity = config.severity(score)

    const assessment = new Assessment({
      user: req.user.id,
      type,
      responses,
      score,
      severity,
    })

    await assessment.save()

    res.status(201).json({
      _id: assessment._id,
      type,
      score,
      severity,
      severityLabel: config.severityLabel(severity),
      maxScore: config.maxScore,
      createdAt: assessment.createdAt,
    })
  } catch (err) {
      throw err
    }
}

export const getMyAssessments = async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query
    const query = { user: req.user.id }
    if (type) query.type = type

    const skip = (Number(page) - 1) * Number(limit)
    const assessments = await Assessment.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .select("-responses")

    const total = await Assessment.countDocuments(query)

    const enriched = assessments.map((a) => {
      const config = SCORING[a.type]
      return {
        _id: a._id,
        type: a.type,
        typeName: config?.name || a.type,
        score: a.score,
        severity: a.severity,
        severityLabel: config?.severityLabel(a.severity) || a.severity,
        maxScore: config?.maxScore || 0,
        createdAt: a.createdAt,
      }
    })

    res.json({ assessments: enriched, total })
  } catch (err) {
      throw err
    }
}

export const getAssessment = async (req, res) => {
  try {
    const assessment = await Assessment.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!assessment) {
      return res.status(404).json({ error: { message: "Assessment not found", code: "NOT_FOUND", category: "USER" } })
    }

    const config = SCORING[assessment.type]
    res.json({
      _id: assessment._id,
      type: assessment.type,
      typeName: config?.name || assessment.type,
      description: config?.description || "",
      responses: assessment.responses,
      score: assessment.score,
      severity: assessment.severity,
      severityLabel: config?.severityLabel(assessment.severity) || assessment.severity,
      maxScore: config?.maxScore || 0,
      createdAt: assessment.createdAt,
    })
  } catch (err) {
      throw err
    }
}

export const getAssessmentTrend = async (req, res) => {
  try {
    const { type } = req.query
    if (!type || !SCORING[type]) {
      return res.status(400).json({ error: { message: "Valid assessment type is required", code: "VALIDATION_ERROR", category: "USER" } })
    }

    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const assessments = await Assessment.find({
      user: req.user.id,
      type,
      createdAt: { $gte: sixMonthsAgo },
    })
      .sort({ createdAt: 1 })
      .select("score severity createdAt")

    const config = SCORING[type]
    const trend = assessments.map((a) => ({
      date: a.createdAt,
      score: a.score,
      severity: a.severity,
      severityLabel: config?.severityLabel(a.severity) || a.severity,
    }))

    res.json({ type, typeName: config?.name || type, trend })
  } catch (err) {
      throw err
    }
}

export const deleteAssessment = async (req, res) => {
  try {
    const assessment = await Assessment.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    })
    if (!assessment) {
      return res.status(404).json({ error: { message: "Assessment not found", code: "NOT_FOUND", category: "USER" } })
    }
    res.json({ message: "Assessment deleted" })
  } catch (err) {
      throw err
    }
}
