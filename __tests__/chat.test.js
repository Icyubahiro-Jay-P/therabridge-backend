import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../models/chat.model.js", () => ({
  Message: {
    find: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
    updateMany: vi.fn(),
    countDocuments: vi.fn(),
  },
  Community: {
    find: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}))

vi.mock("../models/user.model.js", () => ({
  default: {
    find: vi.fn(),
    findById: vi.fn(),
  },
}))

import {
  sendMessage,
  editMessage,
  unsendMessage,
  createCommunity,
  joinCommunity,
  deleteCommunity,
} from "../controllers/chat.controller.js"
import { Message, Community } from "../models/chat.model.js"
import User from "../models/user.model.js"

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

describe("Chat Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("sendMessage", () => {
    it("should reject empty message content", async () => {
      const { req, res } = mockReqRes({
        body: { recipientId: "user456", content: "" },
      })
      await sendMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Message content cannot be empty." })
      )
    })

    it("should reject self-messaging", async () => {
      const { req, res } = mockReqRes({
        body: { recipientId: "user123", content: "Hello!" },
      })
      await sendMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Cannot send message to yourself." })
      )
    })
  })

  describe("editMessage", () => {
    it("should reject empty edit content", async () => {
      const { req, res } = mockReqRes({
        params: { messageId: "msg123" },
        body: { content: "" },
      })
      await editMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Message content cannot be empty." })
      )
    })
  })

  describe("unsendMessage", () => {
    it("should reject non-existent message", async () => {
      Message.findById.mockResolvedValue(null)
      const { req, res } = mockReqRes({
        params: { messageId: "nonexistent" },
      })
      await unsendMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Message not found." })
      )
    })

    it("should reject unsending another user's message", async () => {
      Message.findById.mockResolvedValue({
        _id: "msg123",
        sender: { toString: () => "otheruser" },
      })
      const { req, res } = mockReqRes({
        params: { messageId: "msg123" },
      })
      await unsendMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it("should unsend own message", async () => {
      const saveMock = vi.fn().mockResolvedValue(true)
      Message.findById.mockResolvedValue({
        _id: "msg123",
        sender: { toString: () => "user123" },
        unsent: false,
        content: "original",
        save: saveMock,
      })
      const { req, res } = mockReqRes({
        params: { messageId: "msg123" },
      })
      await unsendMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Message unsent." })
      )
    })
  })

  describe("createCommunity", () => {
    it("should reject short community name", async () => {
      const { req, res } = mockReqRes({
        body: { name: "A", description: "Test" },
      })
      await createCommunity(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Community name must be at least 2 characters." })
      )
    })
  })

  describe("joinCommunity", () => {
    it("should reject invalid invite key", async () => {
      Community.findOne.mockResolvedValue(null)
      const { req, res } = mockReqRes({
        body: { inviteKey: "INVALID" },
      })
      await joinCommunity(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("Invalid") })
      )
    })

    it("should reject when already a member", async () => {
      Community.findOne.mockResolvedValue({
        members: ["user123"],
        name: "Test",
        description: "",
        owner: "ownerid",
        inviteKey: "ABCD1234",
        save: vi.fn().mockResolvedValue(true),
      })
      const { req, res } = mockReqRes({
        body: { inviteKey: "ABCD1234" },
      })
      await joinCommunity(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("already") })
      )
    })
  })

  describe("deleteCommunity", () => {
    it("should reject non-existent community", async () => {
      Community.findById.mockResolvedValue(null)
      const { req, res } = mockReqRes({
        params: { communityId: "nonexistent" },
      })
      await deleteCommunity(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })
  })
})
