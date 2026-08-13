import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../models/user.model.js", () => ({
  default: { countDocuments: vi.fn(), find: vi.fn(), aggregate: vi.fn() },
}))

vi.mock("../models/chat.model.js", () => ({
  Message: { countDocuments: vi.fn(), aggregate: vi.fn() },
  Community: { countDocuments: vi.fn(), aggregate: vi.fn() },
}))

vi.mock("../models/mood.model.js", () => ({
  default: { countDocuments: vi.fn(), aggregate: vi.fn() },
}))

vi.mock("../models/crisis.model.js", () => ({
  default: { countDocuments: vi.fn(), find: vi.fn(), aggregate: vi.fn() },
}))

vi.mock("../models/exerciseLog.model.js", () => ({
  default: { countDocuments: vi.fn(), aggregate: vi.fn() },
}))

vi.mock("../models/notification.model.js", () => ({
  default: { countDocuments: vi.fn() },
}))

vi.mock("../models/auditLog.model.js", () => ({
  default: { find: vi.fn() },
}))

import { getDashboard } from "../controllers/admin.controller.js"
import User from "../models/user.model.js"
import { Message, Community } from "../models/chat.model.js"
import Mood from "../models/mood.model.js"
import Crisis from "../models/crisis.model.js"
import ExerciseLog from "../models/exerciseLog.model.js"
import Notification from "../models/notification.model.js"
import AuditLog from "../models/auditLog.model.js"

function chainableFind(result) {
  return {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    populate: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
  }
}

describe("Admin Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    User.countDocuments = vi.fn((filter = {}) => {
      if (filter.role === "therapist") return Promise.resolve(3)
      if (filter.role === "admin") return Promise.resolve(1)
      if (filter.isDisabled) return Promise.resolve(2)
      if (filter.isAccountVerified === false) return Promise.resolve(4)
      if (filter.createdAt) return Promise.resolve(5)
      return Promise.resolve(100)
    })
    Message.countDocuments = vi.fn().mockResolvedValue(20)
    Community.countDocuments = vi.fn().mockResolvedValue(6)
    Mood.countDocuments = vi.fn().mockResolvedValue(12)
    Crisis.countDocuments = vi.fn((filter = {}) => {
      if (filter.status === "active") return Promise.resolve(1)
      return Promise.resolve(2)
    })
    ExerciseLog.countDocuments = vi.fn().mockResolvedValue(7)
    Notification.countDocuments = vi.fn().mockResolvedValue(30)

    const todayKey = new Date().toISOString().slice(0, 10)
    const dailyRows = (count) => [{ _id: todayKey, count }]
    User.aggregate = vi.fn().mockResolvedValue(dailyRows(5))
    Message.aggregate = vi.fn().mockResolvedValue(dailyRows(20))
    Crisis.aggregate = vi.fn().mockResolvedValue(dailyRows(2))
    ExerciseLog.aggregate = vi.fn().mockResolvedValue(dailyRows(7))
    Mood.aggregate = vi.fn((pipeline) => {
      if (pipeline.some((stage) => stage.$group?._id === "$mood")) {
        return Promise.resolve([
          { _id: "great", count: 4 },
          { _id: "good", count: 3 },
        ])
      }
      return Promise.resolve(dailyRows(12))
    })

    User.find = vi.fn().mockReturnValue(
      chainableFind([{ username: "newbie" }])
    )
    Crisis.find = vi.fn().mockReturnValue(
      chainableFind([{ _id: "c1", status: "active" }])
    )
    AuditLog.find = vi.fn().mockReturnValue(
      chainableFind([{ action: "login" }])
    )

    Community.aggregate = vi.fn((pipeline) => {
      if (pipeline.some((stage) => stage.$count)) {
        // Weekly community-message count.
        return Promise.resolve([{ count: 42 }])
      }
      if (
        pipeline.some((stage) => stage.$group?._id?.$dateToString)
      ) {
        // Daily community-message series.
        return Promise.resolve([{ _id: todayKey, count: 3 }])
      }
      if (pipeline.some((stage) => stage.$addFields)) {
        // Top communities.
        return Promise.resolve([
          { name: "Anxiety Support", memberCount: 5, messageCount: 2 },
        ])
      }
      return Promise.resolve([])
    })
  })

  describe("getDashboard", () => {
    it("should aggregate totals and trends from live counts", async () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      }
      const req = { user: { role: "admin" } }

      await getDashboard(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const payload = res.json.mock.calls[0][0]

      expect(payload.totals).toEqual(
        expect.objectContaining({
          users: 100,
          therapists: 3,
          admins: 1,
          communities: 6,
          activeCrisis: 1,
          unverifiedUsers: 4,
          disabledUsers: 2,
          notifications: 30,
        })
      )

      expect(payload.trends).toEqual(
        expect.objectContaining({
          signupsWeek: 5,
          messagesWeek: 20,
          communityMessagesWeek: 42,
          moodsWeek: 12,
          exercisesWeek: 7,
          crisesWeek: 2,
        })
      )
    })

    it("should count community messages via unwind aggregation", async () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      }
      await getDashboard({ user: { role: "admin" } }, res)

      const countCall = Community.aggregate.mock.calls.find(([p]) =>
        p.some((stage) => stage.$count)
      )
      expect(countCall).toBeTruthy()
      expect(countCall[0][1]).toEqual({ $unwind: "$messages" })

      const dailyCall = Community.aggregate.mock.calls.find(([p]) =>
        p.some((stage) => stage.$group?._id?.$dateToString)
      )
      expect(dailyCall).toBeTruthy()
      expect(dailyCall[0][1]).toEqual({ $unwind: "$messages" })

      const payload = res.json.mock.calls[0][0]
      expect(payload.activity).toHaveLength(14)
      expect(payload.activity[13].communityMessages).toBe(3)
      expect(payload.activity[0].communityMessages).toBe(0)
    })

    it("should build a 14-day activity series with zero-filled days", async () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      }
      await getDashboard({ user: { role: "admin" } }, res)

      const payload = res.json.mock.calls[0][0]
      expect(payload.activity).toHaveLength(14)
      expect(payload.activity[0].signups).toBe(0)
      expect(payload.activity[0].moods).toBe(0)
    })

    it("should merge mood distribution with default buckets", async () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      }
      await getDashboard({ user: { role: "admin" } }, res)

      const payload = res.json.mock.calls[0][0]
      expect(payload.moodDistribution).toEqual({
        great: 4,
        good: 3,
        okay: 0,
        bad: 0,
        terrible: 0,
      })
    })
  })
})
