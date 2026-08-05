import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("../models/safetyPlan.model.js", () => ({
  default: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}))

vi.mock("../models/user.model.js", () => ({
  default: { findById: vi.fn() },
}))

vi.mock("../services/audit.service.js", () => ({
  logAccess: vi.fn(),
  ipFromReq: vi.fn().mockReturnValue("127.0.0.1"),
  uaFromReq: vi.fn().mockReturnValue("test"),
}))

import SafetyPlan from "../models/safetyPlan.model.js"
import User from "../models/user.model.js"
import { logAccess } from "../services/audit.service.js"
import {
  getMySafetyPlan,
  upsertMySafetyPlan,
  getClientSafetyPlan,
} from "../controllers/safetyPlan.controller.js"
import { safetyPlanSchema } from "../utils/validation.js"

// Enabling the field encryption key makes crypto.js actually encrypt at rest,
// so we can assert ciphertext is what gets persisted.
const TEST_KEY = "a".repeat(64)

function mockReqRes(overrides = {}) {
  const req = {
    body: {},
    params: {},
    query: {},
    user: { id: "user123", role: "user" },
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    ...overrides,
  }
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  return { req, res }
}

describe("getMySafetyPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY
  })
  afterEach(() => {
    delete process.env.FIELD_ENCRYPTION_KEY
  })

  it("returns an empty object when the user has no plan", async () => {
    SafetyPlan.findOne.mockResolvedValue(null)
    const { req, res } = mockReqRes()
    await getMySafetyPlan(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({})
  })

  it("returns the decrypted plan when one exists", async () => {
    const { encryptField } = await import("../utils/crypto.js")
    SafetyPlan.findOne.mockResolvedValue({
      _id: "plan1",
      user: "user123",
      warningSigns: [encryptField("losing my appetite")],
      internalCoping: [],
      distractionPeople: [encryptField("my sister")],
      distractionSettings: [],
      helpPeople: [],
      professionals: [],
      meansRestriction: [],
      reasonsForLiving: [],
    })
    const { req, res } = mockReqRes()
    await getMySafetyPlan(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    const plan = res.json.mock.calls[0][0]
    expect(plan.warningSigns).toEqual(["losing my appetite"])
    expect(plan.distractionPeople).toEqual(["my sister"])
    expect(SafetyPlan.findOne).toHaveBeenCalledWith({ user: "user123" })
  })
})

describe("upsertMySafetyPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY
  })
  afterEach(() => {
    delete process.env.FIELD_ENCRYPTION_KEY
  })

  it("persists encrypted items at rest, not plaintext", async () => {
    SafetyPlan.findOneAndUpdate.mockResolvedValue({
      _id: "plan1",
      user: "user123",
      warningSigns: ["cipher"],
      internalCoping: [],
      distractionPeople: [],
      distractionSettings: [],
      helpPeople: [],
      professionals: [],
      meansRestriction: [],
      reasonsForLiving: [],
    })
    const { req, res } = mockReqRes({
      body: {
        warningSigns: ["losing my appetite", "withdrawing from friends"],
        internalCoping: ["deep breathing"],
      },
    })
    await upsertMySafetyPlan(req, res)
    const setPayload = SafetyPlan.findOneAndUpdate.mock.calls[0][1].$set
    expect(SafetyPlan.findOneAndUpdate).toHaveBeenCalledWith(
      { user: "user123" },
      expect.anything(),
      expect.objectContaining({ upsert: true }),
    )
    for (const item of setPayload.warningSigns) {
      expect(item).not.toBe("losing my appetite")
      expect(item.split(":")).toHaveLength(3)
    }
    expect(setPayload.internalCoping[0]).not.toBe("deep breathing")
  })

  it("audit-logs a safety_plan_update", async () => {
    SafetyPlan.findOneAndUpdate.mockResolvedValue({
      _id: "plan1",
      user: "user123",
      warningSigns: [],
      internalCoping: [],
      distractionPeople: [],
      distractionSettings: [],
      helpPeople: [],
      professionals: [],
      meansRestriction: [],
      reasonsForLiving: [],
    })
    const { req, res } = mockReqRes({ body: { warningSigns: ["x"] } })
    await upsertMySafetyPlan(req, res)
    expect(logAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "safety_plan_update",
        targetType: "safety_plan",
        target: "user123",
      }),
    )
  })
})

describe("getClientSafetyPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY
  })
  afterEach(() => {
    delete process.env.FIELD_ENCRYPTION_KEY
  })

  it("returns 404 for an unknown user", async () => {
    User.findById.mockResolvedValue(null)
    const { req, res } = mockReqRes({ params: { userId: "client1" } })
    await getClientSafetyPlan(req, res)
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it("forbids a therapist from viewing a client they are not assigned to", async () => {
    User.findById.mockResolvedValue({ _id: "client1", therapist: "otherTherapist" })
    const { req, res } = mockReqRes({
      params: { userId: "client1" },
      user: { id: "therapist123", role: "therapist" },
    })
    await getClientSafetyPlan(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(SafetyPlan.findOne).not.toHaveBeenCalled()
  })

  it("lets an assigned therapist view the plan and audit-logs it", async () => {
    User.findById.mockResolvedValue({ _id: "client1", therapist: "therapist123" })
    SafetyPlan.findOne.mockResolvedValue({
      _id: "plan1",
      user: "client1",
      warningSigns: [],
      internalCoping: [],
      distractionPeople: [],
      distractionSettings: [],
      helpPeople: [],
      professionals: [],
      meansRestriction: [],
      reasonsForLiving: ["my family"],
    })
    const { req, res } = mockReqRes({
      params: { userId: "client1" },
      user: { id: "therapist123", role: "therapist" },
    })
    await getClientSafetyPlan(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json.mock.calls[0][0].reasonsForLiving).toEqual(["my family"])
    expect(logAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: "safety_plan_view", target: "client1" }),
    )
  })

  it("lets an admin view any client plan", async () => {
    User.findById.mockResolvedValue({ _id: "client1", therapist: "someoneElse" })
    SafetyPlan.findOne.mockResolvedValue(null)
    const { req, res } = mockReqRes({
      params: { userId: "client1" },
      user: { id: "admin1", role: "admin" },
    })
    await getClientSafetyPlan(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({})
  })
})

describe("safetyPlanSchema validation", () => {
  it("accepts empty and partial plans", () => {
    expect(safetyPlanSchema.safeParse({}).success).toBe(true)
    expect(
      safetyPlanSchema.safeParse({ warningSigns: ["a", "b"] }).success,
    ).toBe(true)
  })

  it("rejects more than 10 items in a section", () => {
    const result = safetyPlanSchema.safeParse({
      warningSigns: Array.from({ length: 11 }, (_, i) => `item ${i}`),
    })
    expect(result.success).toBe(false)
  })

  it("rejects items over 120 characters", () => {
    const result = safetyPlanSchema.safeParse({
      warningSigns: ["x".repeat(121)],
    })
    expect(result.success).toBe(false)
  })
})
