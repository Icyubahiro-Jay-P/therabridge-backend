import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../models/mood.model.js", () => ({
  default: vi.fn(),
}))

import { logMood, getMoodStats } from "../controllers/mood.controller.js"
import Mood from "../models/mood.model.js"

function mockReqRes(overrides = {}) {
  const req = {
    body: {},
    params: {},
    query: {},
    user: { id: "user123", role: "user" },
    ...overrides,
  }
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  return { req, res }
}

describe("Mood Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("logMood", () => {
    it("should reject missing mood", async () => {
      const { req, res } = mockReqRes({ body: {} })
      await logMood(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Mood is required." })
      )
    })

    it("should reject invalid mood value", async () => {
      const { req, res } = mockReqRes({ body: { mood: "nonexistent" } })
      await logMood(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Invalid mood value." })
      )
    })
  })

  describe("getMoodStats", () => {
    it("should return empty stats when no moods", async () => {
      Mood.find = vi.fn().mockResolvedValue([])
      const { req, res } = mockReqRes({ query: {} })
      await getMoodStats(req, res)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ total: 0, averageIntensity: 0, streak: 0 })
      )
    })

    it("should calculate stats from mood entries", async () => {
      const today = new Date()
      const moods = [
        { mood: "great", intensity: 8, date: today },
        { mood: "good", intensity: 6, date: today },
        { mood: "okay", intensity: 5, date: today },
      ]
      Mood.find = vi.fn().mockResolvedValue(moods)

      const { req, res } = mockReqRes({ query: {} })
      await getMoodStats(req, res)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 3,
          averageIntensity: 6.3,
          streak: expect.any(Number),
        })
      )
    })
  })
})
