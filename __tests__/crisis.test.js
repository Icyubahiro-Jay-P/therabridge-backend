import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../models/crisis.model.js", () => {
  class Crisis {
    constructor(fields) {
      Object.assign(this, fields)
      this._id = "crisis123"
      this.save = vi.fn().mockResolvedValue(true)
    }
  }
  return { default: Crisis }
})

vi.mock("../models/crisisLog.model.js", () => ({
  default: { create: vi.fn() },
}))

vi.mock("../models/user.model.js", () => ({
  default: { find: vi.fn() },
}))

vi.mock("../services/notification.service.js", () => ({
  createNotification: vi.fn(),
}))

import Crisis from "../models/crisis.model.js"
import CrisisLog from "../models/crisisLog.model.js"
import User from "../models/user.model.js"
import { createNotification as mockCreateNotification } from "../services/notification.service.js"
import { createCrisisAlert } from "../controllers/crisis.controller.js"

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
})
