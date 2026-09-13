import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../models/chat.model.js", () => ({
  Community: { findById: vi.fn() },
}))

vi.mock("../models/communityMessage.model.js", () => ({
  CommunityMessage: {
    find: vi.fn(),
    findOne: vi.fn(),
    exists: vi.fn(),
  },
}))

vi.mock("../models/user.model.js", () => ({
  default: { findById: vi.fn() },
}))

vi.mock("../sockets/chatSocket.js", () => ({
  emitToCommunity: vi.fn(),
}))

import { getCommunityMessages } from "../controllers/communityMessaging.controller.js"
import { Community } from "../models/chat.model.js"
import { CommunityMessage } from "../models/communityMessage.model.js"

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
    set: vi.fn(),
  }
  return { req, res }
}

// Mirrors the DM pagination test's chainable query double.
function makeQuery(items) {
  const query = {
    sort: () => query,
    limit: () => query,
    populate: () => query,
    then: (resolve, reject) => Promise.resolve(items).then(resolve, reject),
  }
  return query
}

function fakeMsg(id) {
  return {
    _id: { toString: () => id },
    community: "comm123",
    content: "encrypted",
    createdAt: new Date(),
    toObject() { return { ...this } },
  }
}

describe("getCommunityMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Community.findById.mockReturnValue({
      select: vi.fn().mockResolvedValue({ members: ["user123"] }),
    })
    CommunityMessage.findOne.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    })
  })

  it("rejects a non-member", async () => {
    Community.findById.mockReturnValue({
      select: vi.fn().mockResolvedValue({ members: ["otheruser"] }),
    })
    const { req, res } = mockReqRes({ params: { communityId: "comm123" } })
    await getCommunityMessages(req, res)
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it("returns the most recent page in chronological order with a cursor for older messages", async () => {
    // Most-recent-first as Mongo would return them for sort({_id:-1}).limit(3).
    const recentDesc = [fakeMsg("j"), fakeMsg("i"), fakeMsg("h")]
    CommunityMessage.find.mockReturnValue(makeQuery(recentDesc))
    CommunityMessage.exists.mockResolvedValue(true)

    const { req, res } = mockReqRes({
      params: { communityId: "comm123" },
      query: { limit: "3" },
    })
    await getCommunityMessages(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const payload = res.json.mock.calls[0][0]
    expect(payload.data.map((m) => m._id.toString())).toEqual(["h", "i", "j"])
    expect(payload.nextCursor.toString()).toBe("h")
  })

  it("reports no further cursor when there is nothing older", async () => {
    CommunityMessage.find.mockReturnValue(makeQuery([fakeMsg("a")]))
    CommunityMessage.exists.mockResolvedValue(false)

    const { req, res } = mockReqRes({
      params: { communityId: "comm123" },
      query: { limit: "3" },
    })
    await getCommunityMessages(req, res)

    const payload = res.json.mock.calls[0][0]
    expect(payload.nextCursor).toBeNull()
  })

  it("pages backward with a cursor, trimming the peeked extra row", async () => {
    // limit+1 peek: 4 rows fetched for a limit of 3 means there's more beyond this page.
    const page = [fakeMsg("e"), fakeMsg("d"), fakeMsg("c"), fakeMsg("b")]
    CommunityMessage.find.mockReturnValue(makeQuery(page))

    const { req, res } = mockReqRes({
      params: { communityId: "comm123" },
      query: { limit: "3", cursor: "f" },
    })
    await getCommunityMessages(req, res)

    const payload = res.json.mock.calls[0][0]
    expect(payload.data.map((m) => m._id.toString())).toEqual(["c", "d", "e"])
    expect(payload.nextCursor.toString()).toBe("c")
  })
})
