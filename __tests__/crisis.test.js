import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../models/crisis.model.js", () => {
  class Crisis {
    constructor(fields) {
      Object.assign(this, fields)
      this._id = "crisis123"
      this.save = vi.fn().mockResolvedValue(true)
    }
    static findById = vi.fn()
  }
  return { default: Crisis }
})

vi.mock("../models/crisisLog.model.js", () => ({
  default: { create: vi.fn() },
}))

vi.mock("../models/user.model.js", () => ({
  default: { find: vi.fn(), findById: vi.fn() },
}))

vi.mock("../models/exercise.model.js", () => {
  const panicExercise = {
    _id: "ex123",
    title: "5-4-3-2-1 Grounding",
    type: "grounding",
    duration: 180,
    steps: [{ instruction: "Name 5 things you can SEE.", duration: 30 }],
  }
  return {
    default: {
      findOne: vi.fn(() => ({ lean: vi.fn().mockResolvedValue(panicExercise) })),
    },
  }
})

vi.mock("../services/notification.service.js", () => ({
  createNotification: vi.fn(),
}))

import Crisis from "../models/crisis.model.js"
import CrisisLog from "../models/crisisLog.model.js"
import User from "../models/user.model.js"
import { createNotification as mockCreateNotification } from "../services/notification.service.js"
import { createCrisisAlert, acknowledgeCrisis, resolveCrisis } from "../controllers/crisis.controller.js"

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

describe("createCrisisAlert severity escalation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    User.find.mockReturnValue({
      select: vi.fn().mockResolvedValue([{ _id: "responder1" }]),
    })
  })

  it("should reject a missing alertType", async () => {
    const { req, res } = mockReqRes({ body: { severity: "severe" } })
    await createCrisisAlert(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(CrisisLog.create).not.toHaveBeenCalled()
  })

  it("should map severe alerts to critical CrisisLogs and notify urgently", async () => {
    const { req, res } = mockReqRes({
      body: { alertType: "self_harm_thoughts", severity: "severe" },
    })
    await createCrisisAlert(req, res)
    expect(CrisisLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "critical", actionTaken: "crisis_alert_created" })
    )
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "responder1",
      "crisis_alert",
      "URGENT Crisis Alert",
      expect.any(String),
      expect.objectContaining({ severity: "severe", priority: "urgent" }),
      "user123"
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it("should notify non-urgently for medium alerts", async () => {
    const { req, res } = mockReqRes({
      body: { alertType: "panic_attack", severity: "medium" },
    })
    await createCrisisAlert(req, res)
    expect(CrisisLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "high" })
    )
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "responder1",
      "crisis_alert",
      "Crisis Alert",
      expect.any(String),
      expect.not.objectContaining({ priority: "urgent" }),
      "user123"
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it("should default to medium severity when omitted", async () => {
    const { req, res } = mockReqRes({
      body: { alertType: "severe_distress" },
    })
    await createCrisisAlert(req, res)
    expect(CrisisLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "high" })
    )
    expect(mockCreateNotification).toHaveBeenCalled()
  })

  it("should log mild alerts without notifying responders unless contact is requested", async () => {
    const { req, res } = mockReqRes({
      body: { alertType: "severe_distress", severity: "mild" },
    })
    await createCrisisAlert(req, res)
    expect(CrisisLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "low" })
    )
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it("should notify non-urgently for mild alerts when contact is requested", async () => {
    const { req, res } = mockReqRes({
      body: { alertType: "severe_distress", severity: "mild", requestContact: true },
    })
    await createCrisisAlert(req, res)
    expect(CrisisLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "low" })
    )
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "responder1",
      "crisis_alert",
      "Crisis Alert",
      expect.any(String),
      expect.not.objectContaining({ priority: "urgent" }),
      "user123"
    )
  })

  it("should include a panic exercise for panic_attack alerts (B2)", async () => {
    const { req, res } = mockReqRes({
      body: { alertType: "panic_attack", severity: "medium" },
    })
    await createCrisisAlert(req, res)
    const payload = res.json.mock.calls[0][0]
    expect(payload.panicExercise).toBeDefined()
    expect(payload.panicExercise.title).toBe("5-4-3-2-1 Grounding")
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it("should not include a panic exercise for other alert types", async () => {
    const { req, res } = mockReqRes({
      body: { alertType: "severe_distress" },
    })
    await createCrisisAlert(req, res)
    const payload = res.json.mock.calls[0][0]
    expect(payload.panicExercise).toBeUndefined()
  })
})

describe("crisis alert authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("forbids a regular user from acknowledging any alert, even their own", async () => {
    Crisis.findById.mockResolvedValue({
      _id: "crisis123",
      user: { toString: () => "user123" },
      status: "active",
      save: vi.fn().mockResolvedValue(true),
    })
    const { req, res } = mockReqRes({
      params: { id: "crisis123" },
      user: { id: "user123", role: "user" },
    })
    await acknowledgeCrisis(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(User.findById).not.toHaveBeenCalled()
  })

  it("forbids a regular user from resolving any alert, even their own", async () => {
    Crisis.findById.mockResolvedValue({
      _id: "crisis123",
      user: { toString: () => "user123" },
      status: "active",
      save: vi.fn().mockResolvedValue(true),
    })
    const { req, res } = mockReqRes({
      params: { id: "crisis123" },
      user: { id: "user123", role: "user" },
    })
    await resolveCrisis(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it("lets an assigned therapist acknowledge an alert", async () => {
    Crisis.findById.mockResolvedValue({
      _id: "crisis123",
      user: { toString: () => "owner456" },
      status: "active",
      save: vi.fn().mockResolvedValue(true),
    })
    User.findById.mockResolvedValue({
      _id: "owner456",
      therapist: { toString: () => "therapist123" },
    })
    const { req, res } = mockReqRes({
      params: { id: "crisis123" },
      user: { id: "therapist123", role: "therapist" },
    })
    await acknowledgeCrisis(req, res)
    expect(User.findById).toHaveBeenCalledWith("owner456")
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it("forbids a therapist from acknowledging an unassigned client's alert", async () => {
    Crisis.findById.mockResolvedValue({
      _id: "crisis123",
      user: { toString: () => "owner456" },
      status: "active",
      save: vi.fn().mockResolvedValue(true),
    })
    User.findById.mockResolvedValue({
      _id: "owner456",
      therapist: { toString: () => "otherTherapist" },
    })
    const { req, res } = mockReqRes({
      params: { id: "crisis123" },
      user: { id: "therapist123", role: "therapist" },
    })
    await acknowledgeCrisis(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it("lets an admin acknowledge any alert", async () => {
    Crisis.findById.mockResolvedValue({
      _id: "crisis123",
      user: { toString: () => "owner456" },
      status: "active",
      save: vi.fn().mockResolvedValue(true),
    })
    const { req, res } = mockReqRes({
      params: { id: "crisis123" },
      user: { id: "admin123", role: "admin" },
    })
    await acknowledgeCrisis(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
  })
})
