import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../models/user.model.js", () => ({
  default: {
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
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

import { register, login, changePassword } from "../controllers/user.controller.js"
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
        expect.objectContaining({ message: "Password must be at least 8 characters long." })
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
        expect.objectContaining({ message: expect.stringContaining("email") })
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
        expect.objectContaining({ message: expect.stringContaining("username") })
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
        expect.objectContaining({ message: expect.stringContaining("age") })
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
        expect.objectContaining({ message: expect.stringContaining("name") })
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
        expect.objectContaining({ message: "Email is already registered." })
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
        expect.objectContaining({ message: "Username is already taken." })
      )
    })
  })

  describe("login", () => {
    it("should reject missing credentials", async () => {
      const { req, res } = mockReqRes({ body: {} })
      await login(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("required") })
      )
    })

    it("should reject wrong password", async () => {
      User.findOne.mockResolvedValue({ _id: "user123", password: "hash" })
      bcrypt.compare.mockResolvedValue(false)

      const { req, res } = mockReqRes({
        body: { identifier: "test@test.com", password: "wrongpass" },
      })
      await login(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Invalid password" })
      )
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
})
