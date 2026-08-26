import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../models/chat.model.js", () => {
  class Community {
    constructor() {
      this.save = vi.fn().mockResolvedValue(true)
      this.populate = vi.fn().mockResolvedValue(true)
    }
  }
  Community.find = vi.fn()
  Community.findById = vi.fn()
  Community.findOne = vi.fn()
  Community.findByIdAndDelete = vi.fn()
  return {
    Message: {
      find: vi.fn(),
      findById: vi.fn(),
      findOne: vi.fn(),
      updateMany: vi.fn(),
      countDocuments: vi.fn(),
    },
    Community,
  }
})

vi.mock("../models/user.model.js", () => ({
  default: {
    find: vi.fn(),
    findById: vi.fn(),
  },
}))

vi.mock("../models/notification.model.js", () => ({
  default: {
    updateMany: vi.fn(),
  },
}))

vi.mock("../sockets/chatSocket.js", () => ({
  recordPossibleScreenshot: vi.fn(),
  emitToUser: vi.fn(),
  emitToCommunity: vi.fn(),
}))

vi.mock("../services/notification.service.js", () => ({
  createNotification: vi.fn(),
}))

import {
  sendMessage,
  editMessage,
  unsendMessage,
  markConversationRead,
} from "../controllers/chat.controller.js"
import { Message, Community } from "../models/chat.model.js"
import User from "../models/user.model.js"
import Notification from "../models/notification.model.js"
import { emitToUser as mockEmitToUser } from "../sockets/chatSocket.js"

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

describe("Chat – DM Messaging", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("sendMessage", () => {
    it("should reject empty message content", async () => {
      User.findById.mockResolvedValue({ _id: "user456" })
      const { req, res } = mockReqRes({
        body: { recipientId: "user456", content: "" },
      })
      await sendMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("empty") }) })
      )
    })

    it("should reject self-messaging", async () => {
      const { req, res } = mockReqRes({
        body: { recipientId: "user123", content: "Hello!" },
      })
      await sendMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("yourself") }) })
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
        expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("empty") }) })
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
        expect.objectContaining({ error: expect.objectContaining({ message: "Message not found." }) })
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
        recipient: { toString: () => "user456" },
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

  describe("markConversationRead", () => {
    function mockUserLookup({ readReceipts } = {}) {
      User.findById.mockImplementation((id) => {
        if (id === "user456") return Promise.resolve({ _id: "user456" })
        return {
          select: () =>
            Promise.resolve({
              _id: "user123",
              chatSettings: readReceipts === undefined ? {} : { readReceipts },
            }),
        }
      })
    }

    beforeEach(() => {
      Message.updateMany.mockReset()
      Notification.updateMany.mockReset()
      mockEmitToUser.mockReset()
    })

    it("should reject a non-existent peer", async () => {
      User.findById.mockResolvedValue(null)
      const { req, res } = mockReqRes({ params: { userId: "nobody" } })
      await markConversationRead(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: "User not found." }) })
      )
    })

    it("should mark inbound messages as read and clear the notification bell", async () => {
      mockUserLookup()
      Message.updateMany.mockResolvedValue({ modifiedCount: 2 })
      Notification.updateMany.mockResolvedValue({ modifiedCount: 2 })
      const { req, res } = mockReqRes({ params: { userId: "user456" } })
      await markConversationRead(req, res)
      expect(Message.updateMany).toHaveBeenCalledWith(
        { sender: "user456", recipient: "user123", read: false },
        expect.objectContaining({ $set: expect.objectContaining({ read: true }) })
      )
      expect(Notification.updateMany).toHaveBeenCalledWith(
        { recipient: "user123", sender: "user456", read: false, type: "message" },
        expect.anything()
      )
      expect(mockEmitToUser).toHaveBeenCalledWith("user123", "conversations_updated", { partnerId: "user456" })
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Conversation marked as read.", markedRead: 2 })
      )
    })

    it("should skip flipping message read flags when the reader disabled read receipts", async () => {
      mockUserLookup({ readReceipts: false })
      Notification.updateMany.mockResolvedValue({ modifiedCount: 1 })
      const { req, res } = mockReqRes({ params: { userId: "user456" } })
      await markConversationRead(req, res)
      expect(Message.updateMany).not.toHaveBeenCalled()
      expect(Notification.updateMany).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ markedRead: 0 })
      )
    })
  })
})
