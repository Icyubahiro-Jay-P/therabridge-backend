import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../models/user.model.js", () => ({
  default: {
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    updateOne: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock("../services/audit.service.js", () => ({
  logAccess: vi.fn(),
  ipFromReq: vi.fn().mockReturnValue("127.0.0.1"),
  uaFromReq: vi.fn().mockReturnValue("test"),
}))

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashedpassword"),
    compare: vi.fn(),
  },
}))

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn().mockReturnValue("mock-token"),
    verify: vi.fn(),
  },
}))

import { register, login, changePassword, getFullUserData } from "../controllers/user.controller.js"
import User from "../models/user.model.js"
import bcrypt from "bcryptjs"

function mockReqRes(overrides = {}) {
  const req = {
    body: {},
    cookies: {},
    user: { id: "user123", role: "user" },
    params: {},
    ...overrides,
  }
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
  }
  return { req, res }
}

describe("Auth Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("register validation", () => {
    it("should reject missing fields", async () => {
      const { req, res } = mockReqRes({ body: {} })
      await register(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("should reject short password", async () => {
      const { req, res } = mockReqRes({
        body: {
          username: "testuser",
          email: "test@test.com",
          password: "short",
          firstName: "Test",
          lastName: "User",
          dateOfBirth: "2000-01-01",
        },
      })
      await register(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: "Password must be at least 8 characters long." }) })
      )
    })

    it("should reject invalid email format", async () => {
      const { req, res } = mockReqRes({
        body: {
          username: "testuser",
          email: "notanemail",
          password: "password123",
          firstName: "Test",
          lastName: "User",
          dateOfBirth: "2000-01-01",
        },
      })
      await register(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("email") }) })
      )
    })

    it("should reject invalid username (too short)", async () => {
      const { req, res } = mockReqRes({
        body: {
          username: "us",
          email: "test@test.com",
          password: "password123",
          firstName: "Test",
          lastName: "User",
          dateOfBirth: "2000-01-01",
        },
      })
      await register(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("username") }) })
      )
    })

    it("should reject underage users", async () => {
      const { req, res } = mockReqRes({
        body: {
          username: "testuser",
          email: "test@test.com",
          password: "password123",
          firstName: "Test",
          lastName: "User",
          dateOfBirth: "2010-01-01",
        },
      })
      await register(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("age") }) })
      )
    })

    it("should reject short first name", async () => {
      const { req, res } = mockReqRes({
        body: {
          username: "testuser",
          email: "test@test.com",
          password: "password123",
          firstName: "A",
          lastName: "User",
          dateOfBirth: "2000-01-01",
        },
      })
      await register(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("name") }) })
      )
    })

    it("should reject duplicate email", async () => {
      User.findOne.mockResolvedValue({
        email: "test@test.com",
        username: "other",
      })

      const { req, res } = mockReqRes({
        body: {
          username: "testuser",
          email: "test@test.com",
          password: "password123",
          firstName: "Test",
          lastName: "User",
          dateOfBirth: "2000-01-01",
        },
      })
      await register(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: "Email is already registered." }) })
      )
    })

    it("should reject duplicate username", async () => {
      User.findOne.mockResolvedValue({
        email: "other@test.com",
        username: "testuser",
      })

      const { req, res } = mockReqRes({
        body: {
          username: "testuser",
          email: "test@test.com",
          password: "password123",
          firstName: "Test",
          lastName: "User",
          dateOfBirth: "2000-01-01",
        },
      })
      await register(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: "Username is already taken." }) })
      )
    })
  })

  describe("login", () => {
    it("should reject missing credentials", async () => {
      const { req, res } = mockReqRes({ body: {} })
      await login(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("required") }) }) })
      )
    })

    it("should reject wrong password", async () => {
      User.findOne.mockResolvedValue({ _id: "user123", password: "hash" })
      bcrypt.compare.mockResolvedValue(false)

      const { req, res } = mockReqRes({
        body: { identifier: "test@test.com", password: "wrongpass" },
      })
      await login(req, res)
      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ error: expect.objectContaining({ message: "Invalid credentials." }) }) })
      )
    })

    it("locks the account after MAX_LOGIN_ATTEMPTS consecutive failures", async () => {
      const user = { _id: "user123", password: "hash", failedLoginAttempts: 0 }
      User.findOne.mockResolvedValue(user)
      bcrypt.compare.mockResolvedValue(false)
      User.updateOne.mockImplementation(async (_filter, update) => {
        if (update.$set.failedLoginAttempts !== undefined) {
          user.failedLoginAttempts = update.$set.failedLoginAttempts
        }
        return {}
      })

      const { req, res } = mockReqRes({
        body: { identifier: "test@test.com", password: "wrongpass" },
      })
      for (let i = 0; i < 5; i++) {
        await login(req, res)
      }
      expect(User.updateOne).toHaveBeenLastCalledWith(
        { _id: "user123" },
        expect.objectContaining({
          $set: expect.objectContaining({ lockedUntil: expect.any(Date) }),
        })
      )
      expect(res.status).toHaveBeenLastCalledWith(429)
      expect(res.json).toHaveBeenLastCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: "ACCOUNT_LOCKED" }) })
      )
    })

    it("rejects with 429 while the account is locked", async () => {
      User.findOne.mockResolvedValue({
        _id: "user123",
        password: "hash",
        lockedUntil: new Date(Date.now() + 60 * 60 * 1000),
      })
      bcrypt.compare.mockResolvedValue(false)

      const { req, res } = mockReqRes({
        body: { identifier: "test@test.com", password: "wrongpass" },
      })
      await login(req, res)
      expect(res.status).toHaveBeenCalledWith(429)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: "ACCOUNT_LOCKED" }) })
      )
    })

    it("clears lockout state on a successful login", async () => {
      const user = {
        _id: "user123",
        password: "hash",
        failedLoginAttempts: 3,
        lockedUntil: new Date(Date.now() - 60 * 60 * 1000),
        refreshTokens: [],
        save: vi.fn().mockResolvedValue(true),
      }
      User.findOne.mockResolvedValue(user)
      bcrypt.compare.mockResolvedValue(true)

      const { req, res } = mockReqRes({
        body: { identifier: "test@test.com", password: "correctpass" },
      })
      await login(req, res)
      expect(User.updateOne).toHaveBeenCalledWith(
        { _id: "user123" },
        { $set: { failedLoginAttempts: 0, lockedUntil: null } }
      )
      expect(res.status).toHaveBeenCalledWith(200)
    })
  })

  describe("changePassword", () => {
    it("should reject invalid current password", async () => {
      User.findById.mockResolvedValue({
        _id: "user123",
        password: "hash",
        oldPasswords: [],
        save: vi.fn(),
      })
      bcrypt.compare.mockResolvedValue(false)

      const { req, res } = mockReqRes({
        body: { currentPassword: "wrong", newPassword: "newpassword123" },
      })
      await changePassword(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe("getFullUserData", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("forbids a therapist from viewing a user they are not assigned to", async () => {
      User.findById.mockReturnValue({
        select: vi.fn().mockResolvedValue({
          _id: "client1",
          role: "user",
          therapist: "otherTherapist",
          firstName: "Sensitive",
          email: "client@example.com",
        }),
      })
      const { req, res } = mockReqRes({
        params: { id: "client1" },
        user: { id: "therapist123", role: "therapist" },
      })
      await getFullUserData(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it("lets an assigned therapist view the client profile", async () => {
      const client = {
        _id: "client1",
        role: "user",
        therapist: "therapist123",
        firstName: "Client",
        email: "client@example.com",
      }
      User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(client) })
      const { req, res } = mockReqRes({
        params: { id: "client1" },
        user: { id: "therapist123", role: "therapist" },
      })
      await getFullUserData(req, res)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(client)
    })

    it("lets an admin view any user profile", async () => {
      const client = {
        _id: "client1",
        role: "user",
        firstName: "Client",
        email: "client@example.com",
      }
      User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(client) })
      const { req, res } = mockReqRes({
        params: { id: "client1" },
        user: { id: "admin123", role: "admin" },
      })
      await getFullUserData(req, res)
      expect(res.status).toHaveBeenCalledWith(200)
    })
  })
})
