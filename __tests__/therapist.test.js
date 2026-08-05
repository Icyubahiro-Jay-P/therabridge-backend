import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../models/user.model.js", () => ({
  default: { find: vi.fn() },
}))
vi.mock("../models/mood.model.js", () => ({
  default: { find: vi.fn() },
}))
vi.mock("../models/crisis.model.js", () => ({
  default: { find: vi.fn() },
}))
vi.mock("../models/exerciseLog.model.js", () => ({
  default: { find: vi.fn() },
}))
vi.mock("../services/audit.service.js", () => ({
  logAccess: vi.fn(),
  ipFromReq: vi.fn().mockReturnValue("127.0.0.1"),
  uaFromReq: vi.fn().mockReturnValue("test"),
}))

import User from "../models/user.model.js"
import Mood from "../models/mood.model.js"
import Crisis from "../models/crisis.model.js"
import ExerciseLog from "../models/exerciseLog.model.js"
import { logAccess } from "../services/audit.service.js"
import { getClientsRiskSummary } from "../controllers/therapist.controller.js"

const HOUR = 3600000
const DAY = 86400000
const NOW = new Date()
const ago = (ms) => new Date(NOW.getTime() - ms)

const chain = (value) => ({
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(value),
})

const client = (overrides = {}) => ({
  _id: "c1",
  firstName: "Alice",
  lastName: "Jones",
  username: "alice",
  lastLoginDate: ago(0),
  loginStreak: 3,
  ...overrides,
})

function mockReqRes() {
  const req = {
    body: {},
    params: {},
    query: {},
    user: { id: "therapist1", role: "therapist" },
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  }
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  return { req, res }
}

function setupData({ clients, moods = [], crises = [], exercises = [] }) {
  User.find.mockReturnValue(chain(clients))
  Mood.find.mockReturnValue(chain(moods))
  Crisis.find.mockReturnValue(chain(crises))
  ExerciseLog.find.mockReturnValue(chain(exercises))
}

describe("getClientsRiskSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns a low signal for a client with no notable signals", async () => {
    setupData({
      clients: [client()],
      exercises: [{ user: "c1", completedAt: ago(2 * DAY) }],
    })
    const { req, res } = mockReqRes()
    await getClientsRiskSummary(req, res)
    const payload = res.json.mock.calls[0][0]
    expect(payload.clients).toHaveLength(1)
    expect(payload.clients[0].signalLevel).toBe("low")
    expect(payload.clients[0].reasons).toEqual([])
  })

  it("flags a severe crisis in the last 24h as high", async () => {
    setupData({
      clients: [client()],
      crises: [
        {
          user: "c1",
          alertType: "self_harm_thoughts",
          severity: "severe",
          createdAt: ago(HOUR),
        },
      ],
    })
    const { req, res } = mockReqRes()
    await getClientsRiskSummary(req, res)
    const summary = res.json.mock.calls[0][0].clients[0]
    expect(summary.signalLevel).toBe("high")
    expect(summary.reasons).toContain("Severe crisis alert in the last 24 hours")
  })

  it("flags 4+ low moods in 7 days as high", async () => {
    setupData({
      clients: [client()],
      moods: [
        { user: "c1", mood: "bad", date: ago(DAY) },
        { user: "c1", mood: "bad", date: ago(2 * DAY) },
        { user: "c1", mood: "terrible", date: ago(3 * DAY) },
        { user: "c1", mood: "bad", date: ago(4 * DAY) },
      ],
    })
    const { req, res } = mockReqRes()
    await getClientsRiskSummary(req, res)
    const summary = res.json.mock.calls[0][0].clients[0]
    expect(summary.signalLevel).toBe("high")
    expect(summary.reasons).toContain("4 low moods in the last 7 days")
  })

  it("flags no exercise in 14 days and long inactivity as medium", async () => {
    setupData({
      clients: [client({ lastLoginDate: ago(9 * DAY) })],
      exercises: [],
    })
    const { req, res } = mockReqRes()
    await getClientsRiskSummary(req, res)
    const summary = res.json.mock.calls[0][0].clients[0]
    expect(summary.signalLevel).toBe("medium")
    expect(summary.reasons).toContain("No exercises completed in the last 14 days")
    expect(summary.reasons).toContain("No login in 9 days")
  })

  it("reports the mood trend direction and last mood", async () => {
    setupData({
      clients: [client()],
      moods: [
        { user: "c1", mood: "good", date: ago(10 * DAY) },
        { user: "c1", mood: "okay", date: ago(9 * DAY) },
        { user: "c1", mood: "bad", date: ago(2 * DAY) },
        { user: "c1", mood: "terrible", date: ago(DAY) },
      ],
    })
    const { req, res } = mockReqRes()
    await getClientsRiskSummary(req, res)
    const signals = res.json.mock.calls[0][0].clients[0].signals
    expect(signals.mood.trend).toBe("declining")
    expect(signals.mood.lastMood).toBe("terrible")
    expect(signals.mood.negativeLast7d).toBe(2)
  })

  it("audit-logs the risk summary view", async () => {
    setupData({
      clients: [client()],
      exercises: [{ user: "c1", completedAt: ago(DAY) }],
    })
    const { req, res } = mockReqRes()
    await getClientsRiskSummary(req, res)
    expect(logAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "risk_summary_view",
        actor: "therapist1",
        targetType: "user",
      }),
    )
  })

  it("returns an empty roster when the therapist has no clients", async () => {
    setupData({ clients: [] })
    const { req, res } = mockReqRes()
    await getClientsRiskSummary(req, res)
    expect(res.json.mock.calls[0][0].clients).toEqual([])
  })
})
