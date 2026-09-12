import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("../config/allowedOrigins.js", () => ({
  default: ["https://therabridge.vercel.app"],
}))

const { default: getClientOrigin } = await import("../utils/clientOrigin.js")

describe("getClientOrigin", () => {
  const originalClientUrl = process.env.CLIENT_URL

  beforeEach(() => {
    process.env.CLIENT_URL = "https://therabridge.example"
  })

  afterEach(() => {
    process.env.CLIENT_URL = originalClientUrl
  })

  it("returns the Origin header when it matches the allowlist", () => {
    const req = { headers: { origin: "https://therabridge.vercel.app" } }
    expect(getClientOrigin(req)).toBe("https://therabridge.vercel.app")
  })

  it("falls back to CLIENT_URL when Origin is absent, ignoring any Referer", () => {
    const req = { headers: { referer: "https://attacker.example/phish" } }
    expect(getClientOrigin(req)).toBe("https://therabridge.example")
  })

  it("falls back to CLIENT_URL when Origin does not match the allowlist, even with a spoofed Referer", () => {
    const req = {
      headers: {
        origin: "https://attacker.example",
        referer: "https://attacker.example/phish",
      },
    }
    expect(getClientOrigin(req)).toBe("https://therabridge.example")
  })
})
