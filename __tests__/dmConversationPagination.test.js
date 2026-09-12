import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../models/chat.model.js", () => ({
  Message: {
    find: vi.fn(),
    exists: vi.fn().mockResolvedValue(false),
    updateMany: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock("../models/user.model.js", () => ({
  default: {
    findById: vi.fn(),
  },
}))

vi.mock("../models/notification.model.js", () => ({
  default: { updateMany: vi.fn() },
}))

vi.mock("../sockets/chatSocket.js", () => ({
  emitToUser: vi.fn(),
}))

import { getConversation } from "../controllers/dmConversation.controller.js"
import { Message } from "../models/chat.model.js"
import User from "../models/user.model.js"

function mockReqRes(overrides = {}) {
  const req = {
    body: {},
    params: {},
    query: {},
    user: { id: "myId", role: "user" },
    ...overrides,
  }
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    set: vi.fn(),
  }
  return { req, res }
}

// A minimal chainable query double: .sort()/.limit()/.populate() all return
// itself, and it resolves (via `then`) to whatever array it was built with -
// mirrors just enough of the Mongoose query builder API for this controller.
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
    content: "encrypted",
    createdAt: new Date(),
    toObject() { return { ...this } },
  }
}

describe("getConversation pagination cap", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    User.findById.mockReturnValue({
      select: vi.fn().mockResolvedValue({ chatSettings: { readReceipts: false } }),
    })
  })

  it("never returns more than the requested limit, even with many unread messages", async () => {
    // 3 "recent" messages (h, i, j - most recent) and 5 disjoint "unread"
    // messages (c, d, e, f, g - older) with zero overlap: 8 distinct
    // messages total against a page size of 3.
    const recent = [fakeMsg("j"), fakeMsg("i"), fakeMsg("h")]
    const unread = [fakeMsg("c"), fakeMsg("d"), fakeMsg("e"), fakeMsg("f"), fakeMsg("g")]

    Message.find.mockImplementation((filter) =>
      makeQuery(filter.read === false ? unread : recent),
    )

    const { req, res } = mockReqRes({
      params: { userId: "peerId" },
      query: { limit: "3" },
    })
    await getConversation(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const payload = res.json.mock.calls[0][0]
    expect(payload.data.length).toBeLessThanOrEqual(3)
    // The trimmed page should keep the most recent messages, not an
    // arbitrary/oldest slice.
    expect(payload.data.map((m) => m._id.toString())).toEqual(["h", "i", "j"])
  })
})
