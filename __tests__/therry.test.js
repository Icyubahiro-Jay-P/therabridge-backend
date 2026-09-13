import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor() {
      this.models = { generateContent: vi.fn().mockResolvedValue({ text: "ok" }) }
    }
  },
}))

vi.mock("../models/therryMessage.model.js", () => ({
  TherryMessage: { create: vi.fn().mockResolvedValue({ _id: "msg1" }) },
}))

vi.mock("../models/crisis.model.js", () => ({
  default: { create: vi.fn().mockResolvedValue([{ _id: "crisis1" }]) },
}))

vi.mock("../models/crisisLog.model.js", () => ({
  default: { create: vi.fn().mockResolvedValue([{ _id: "log1" }]) },
}))

vi.mock("../models/user.model.js", () => ({
  default: {
    findById: vi.fn(),
    find: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock("../services/notification.service.js", () => ({
  createNotification: vi.fn().mockResolvedValue(true),
}))

vi.mock("../utils/points.js", () => ({
  awardMessagePoints: vi.fn().mockResolvedValue(0),
  MESSAGE_POINTS: { direct: 2, community: 2, therry: 5 },
}))

vi.mock("../utils/transactions.js", () => ({
  withTransaction: (fn) => fn(null),
  default: (fn) => fn(null),
}))

vi.mock("../utils/hotlines.js", () => ({
  getHotlinesForCountry: vi.fn().mockReturnValue([]),
}))

vi.mock("../controllers/exercise.controller.js", () => ({
  getPanicExercise: vi.fn().mockResolvedValue(null),
}))

import { chat } from "../controllers/therry.controller.js"
import Crisis from "../models/crisis.model.js"
import CrisisLog from "../models/crisisLog.model.js"
import User from "../models/user.model.js"

function mockReqRes(overrides = {}) {
  const req = {
    body: {},
    user: { id: "user123", role: "user" },
    ...overrides,
  }
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  return { req, res }
}

describe("Therry crisis detection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    User.findById.mockReturnValue({
      select: vi.fn().mockResolvedValue({ therapist: null, countryCode: "US" }),
    })
    User.find.mockResolvedValue([])
  })

  it("classifies an unambiguous method/plan statement as a crisis (previously slipped through as general)", async () => {
    const { req, res } = mockReqRes({
      body: { message: "I have a plan to jump off the bridge tonight" },
    })
    await chat(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    const payload = res.json.mock.calls[0][0]
    expect(payload.category).toBe("crisis")
    expect(payload.isCrisis).toBe(true)
    expect(Crisis.create).toHaveBeenCalled()
    expect(CrisisLog.create).toHaveBeenCalled()
  })

  it("classifies 'better off dead' phrasing as a crisis", async () => {
    const { req, res } = mockReqRes({
      body: { message: "everyone would be better off dead without me" },
    })
    await chat(req, res)
    const payload = res.json.mock.calls[0][0]
    expect(payload.category).toBe("crisis")
  })

  it("still classifies ordinary anxious messages as non-crisis", async () => {
    const { req, res } = mockReqRes({
      body: { message: "I'm feeling really anxious about my exam tomorrow" },
    })
    await chat(req, res)
    const payload = res.json.mock.calls[0][0]
    expect(payload.category).toBe("anxiety")
    expect(payload.isCrisis).toBe(false)
    expect(Crisis.create).not.toHaveBeenCalled()
  })
})
