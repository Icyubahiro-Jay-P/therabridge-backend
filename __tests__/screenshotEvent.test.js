import { describe, it, expect, vi, beforeEach } from "vitest"

const mockCreate = vi.fn()
const mockExists = vi.fn()
const mockFindOne = vi.fn()
const mockFindById = vi.fn()
const mockSave = vi.fn()

vi.mock("../models/screenshotEvent.model.js", () => ({
  default: {
    create: (...args) => mockCreate(...args),
    exists: (...args) => mockExists(...args),
  },
}))

vi.mock("../models/viewingSession.model.js", () => ({
  default: class {
    constructor(fields) {
      this._fields = fields
    }
    get _id() {
      return "sessionid123"
    }
    get contentId() {
      return this._fields.contentId
    }
    get contentType() {
      return this._fields.contentType
    }
    get contentType$() {
      return this._fields.contentType
    }
    get viewerId() {
      return this._fields.viewerId
    }
    get ownerId() {
      return this._fields.ownerId
    }
    get sessionToken() {
      return this._fields.sessionToken
    }
    get protectionMode() {
      return this._fields.protectionMode
    }
    save() {
      return mockSave()
    }
  },
}))

vi.mock("../models/user.model.js", () => ({
  default: {
    findById: (...args) => mockFindById(...args),
  },
}))

vi.mock("../services/notification.service.js", () => ({
  createNotification: vi.fn(),
}))

vi.mock("../services/cache.js", () => ({
  redis: {
    set: vi.fn().mockResolvedValue("OK"),
  },
}))

import {
  createViewingSession,
  recordScreenshotEvent,
} from "../services/screenshotEvent.service.js"
import { Message } from "../models/chat.model.js"
import { redis } from "../services/cache.js"

beforeEach(() => {
  vi.clearAllMocks()
  mockFindOne.mockReset()
  mockExists.mockReset()
  mockCreate.mockReset()
  mockSave.mockReset()
  redis.set.mockResolvedValue("OK")
  mockFindOne.mockImplementation(() => ({
    sort: () => ({ select: () => ({ lean: () => Promise.resolve({ _id: "msg123" }) }) }),
  }))
})

describe("createViewingSession", () => {
  it("rejects an invalid contentId", async () => {
    const res = await createViewingSession({
      actorId: "aaaabbbbccccddddeeeeffff",
      contentId: "not-an-objectid",
    })
    expect(res.error).toBe("INVALID_CONTENT_ID")
  })

  it("rejects an invalid contentType", async () => {
    const res = await createViewingSession({
      actorId: "aaaabbbbccccddddeeeeffff",
      contentId: "aaaabbbbccccddddeeeeffff",
      contentType: "bogus",
    })
    expect(res.error).toBe("INVALID_CONTENT_TYPE")
  })

  it("rejects an invalid platform", async () => {
    const res = await createViewingSession({
      actorId: "aaaabbbbccccddddeeeeffff",
      contentId: "aaaabbbbccccddddeeeeffff",
      platform: "beos",
    })
    expect(res.error).toBe("INVALID_PLATFORM")
  })

  it("creates a session and returns a token", async () => {
    mockSave.mockResolvedValue(true)
    const res = await createViewingSession({
      actorId: "aaaabbbbccccddddeeeeffff",
      contentId: "aaaabbbbccccddddeeeeffff",
      contentType: "message",
      platform: "web",
    })
    expect(res.error).toBeUndefined()
    expect(res.sessionToken).toBeTruthy()
    expect(res.session.contentId.toString()).toBe("aaaabbbbccccddddeeeeffff")
  })
})

describe("recordScreenshotEvent", () => {
  const validContext = {
    actorId: "aaaabbbbccccddddeeeeffff",
    contentId: "bbbcccddddeeeffff00011111",
    sessionToken: "tok123",
  }

  it("rejects an invalid contentId", async () => {
    const res = await recordScreenshotEvent({ ...validContext, contentId: "nope" })
    expect(res.status).toBe(400)
  })

  it("requires a session token", async () => {
    const res = await recordScreenshotEvent({ ...validContext, sessionToken: undefined })
    expect(res.status).toBe(400)
  })

  it("rejects when no live session matches the token", async () => {
    mockFindOne.mockResolvedValue(null)
    const res = await recordScreenshotEvent({ ...validContext })
    expect([403, 400]).toContain(res.status)
  })

  it("rejects when the session belongs to a different actor", async () => {
    mockFindOne.mockResolvedValue({
      endedAt: null,
      viewerId: { toString: () => "otheruserid" },
      contentId: { toString: () => validContext.contentId },
      ownerId: { toString: () => validContext.actorId },
      _id: { toString: () => "sessionid" },
    })
    const res = await recordScreenshotEvent({ ...validContext })
    expect(res.status).toBe(403)
  })

  it("rejects when the session contentId mismatches the report", async () => {
    mockFindOne.mockResolvedValue({
      endedAt: null,
      viewerId: { toString: () => validContext.actorId },
      contentId: { toString: () => "differentcontentid" },
      ownerId: { toString: () => validContext.actorId },
      _id: { toString: () => "sessionid" },
    })
    const res = await recordScreenshotEvent({ ...validContext })
    expect(res.status).toBe(403)
  })

  it("records a valid event and returns 201", async () => {
    mockFindOne.mockResolvedValue({
      endedAt: null,
      viewerId: { toString: () => validContext.actorId },
      contentId: { toString: () => validContext.contentId },
      ownerId: { toString: () => "ownerid" },
      _id: { toString: () => "sessionid" },
    })
    mockExists.mockResolvedValue(false)
    mockCreate.mockResolvedValue({
      contentType: "message",
      contentId: { toString: () => validContext.contentId },
      eventId: "evt-1",
    })
    const res = await recordScreenshotEvent({
      ...validContext,
      eventType: "SCREENSHOT",
      confidence: "probable",
      detectionMethod: "web_heuristic",
    })
    expect(res.status).toBe(201)
    expect(mockCreate).toHaveBeenCalled()
  })

  it("deduplicates an in-window event already recorded", async () => {
    mockFindOne.mockResolvedValue({
      endedAt: null,
      viewerId: { toString: () => validContext.actorId },
      contentId: { toString: () => validContext.contentId },
      ownerId: { toString: () => "ownerid" },
      _id: { toString: () => "sessionid" },
    })
    // Redis claims already taken (duplicate)
    redis.set.mockResolvedValue(null)
    const res = await recordScreenshotEvent({
      ...validContext,
      eventType: "SCREENSHOT",
    })
    expect(res.body.deduplicated).toBe(true)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("handles unique-index collision as a duplicate", async () => {
    mockFindOne.mockResolvedValue({
      endedAt: null,
      viewerId: { toString: () => validContext.actorId },
      contentId: { toString: () => validContext.contentId },
      ownerId: { toString: () => "ownerid" },
      _id: { toString: () => "sessionid" },
    })
    mockExists.mockResolvedValue(false)
    mockCreate.mockRejectedValue({ code: 11000 })
    const res = await recordScreenshotEvent({
      ...validContext,
      eventType: "SCREENSHOT",
    })
    expect(res.body.deduplicated).toBe(true)
  })
})

// Silence unused import guard — Message is used by a sibling export path.
void Message
