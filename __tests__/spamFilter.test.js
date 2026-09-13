import { describe, it, expect, vi } from "vitest"
import { spamFilter } from "../middleware/spamFilter.js"

function mockReqRes(overrides = {}) {
  const req = {
    body: {},
    user: { id: "user123" },
    ...overrides,
  }
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  const next = vi.fn()
  return { req, res, next }
}

describe("spamFilter", () => {
  it("passes through empty content", async () => {
    const { req, res, next } = mockReqRes({ body: { content: "  " } })
    await spamFilter(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it("passes the first message through", async () => {
    const { req, res, next } = mockReqRes({
      body: { content: "hello there" },
      user: { id: "unique-user-1" },
    })
    await spamFilter(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it("rejects the exact same content sent again immediately by the same user", async () => {
    const user = { id: "unique-user-2" }
    const first = mockReqRes({ body: { content: "spam me" }, user })
    await spamFilter(first.req, first.res, first.next)
    expect(first.next).toHaveBeenCalled()

    const second = mockReqRes({ body: { content: "spam me" }, user })
    await spamFilter(second.req, second.res, second.next)
    expect(second.next).not.toHaveBeenCalled()
    expect(second.res.status).toHaveBeenCalledWith(429)
  })

  it("allows different content back-to-back from the same user", async () => {
    const user = { id: "unique-user-3" }
    const first = mockReqRes({ body: { content: "message one" }, user })
    await spamFilter(first.req, first.res, first.next)

    const second = mockReqRes({ body: { content: "message two" }, user })
    await spamFilter(second.req, second.res, second.next)
    expect(second.next).toHaveBeenCalled()
    expect(second.res.status).not.toHaveBeenCalled()
  })
})
