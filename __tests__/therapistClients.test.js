import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../models/user.model.js", () => ({
  default: { findById: vi.fn() },
}))
vi.mock("../services/audit.service.js", () => ({
  logAccess: vi.fn(),
  ipFromReq: vi.fn().mockReturnValue("127.0.0.1"),
  uaFromReq: vi.fn().mockReturnValue("test"),
}))
vi.mock("../services/notification.service.js", () => ({
  createNotification: vi.fn(),
}))

import User from "../models/user.model.js"
import { createNotification as mockCreateNotification } from "../services/notification.service.js"
import { addTherapistClient, respondTherapistRequest } from "../controllers/therapistClients.controller.js"

function mockReqRes(overrides = {}) {
  const req = {
    body: {},
    params: {},
    user: { id: "therapist123", role: "therapist", username: "drjones" },
    ...overrides,
  }
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  return { req, res }
}

function fakeUser(overrides = {}) {
  return {
    _id: "user456",
    role: "user",
    username: "alice",
    therapist: null,
    pendingTherapistRequest: null,
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe("addTherapistClient (consent flow)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("opens a pending request instead of linking the therapist immediately", async () => {
    const user = fakeUser()
    User.findById.mockResolvedValue(user)
    const { req, res } = mockReqRes({ body: { userId: "user456" } })

    await addTherapistClient(req, res)

    expect(user.therapist).toBeNull()
    expect(user.pendingTherapistRequest).toBe("therapist123")
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "user456",
      "therapist_request",
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ therapistId: "therapist123" }),
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it("rejects a request for a user who already has a therapist", async () => {
    User.findById.mockResolvedValue(fakeUser({ therapist: "otherTherapist" }))
    const { req, res } = mockReqRes({ body: { userId: "user456" } })

    await addTherapistClient(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it("rejects a duplicate request when one is already pending", async () => {
    User.findById.mockResolvedValue(fakeUser({ pendingTherapistRequest: "therapist123" }))
    const { req, res } = mockReqRes({ body: { userId: "user456" } })

    await addTherapistClient(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })
})

describe("respondTherapistRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("links the therapist and clears the pending request on approve", async () => {
    const user = fakeUser({ pendingTherapistRequest: "therapist123" })
    User.findById.mockResolvedValue(user)
    const { req, res } = mockReqRes({
      body: { action: "approve" },
      user: { id: "user456", role: "user" },
    })

    await respondTherapistRequest(req, res)

    expect(user.therapist).toBe("therapist123")
    expect(user.pendingTherapistRequest).toBeNull()
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "therapist123",
      "system",
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ userId: "user456" }),
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it("clears the pending request without linking on reject", async () => {
    const user = fakeUser({ pendingTherapistRequest: "therapist123" })
    User.findById.mockResolvedValue(user)
    const { req, res } = mockReqRes({
      body: { action: "reject" },
      user: { id: "user456", role: "user" },
    })

    await respondTherapistRequest(req, res)

    expect(user.therapist).toBeNull()
    expect(user.pendingTherapistRequest).toBeNull()
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it("404s when there is no pending request", async () => {
    User.findById.mockResolvedValue(fakeUser({ pendingTherapistRequest: null }))
    const { req, res } = mockReqRes({
      body: { action: "approve" },
      user: { id: "user456", role: "user" },
    })

    await respondTherapistRequest(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })
})
