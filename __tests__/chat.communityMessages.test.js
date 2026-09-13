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

vi.mock("../models/communityMessage.model.js", () => ({
  CommunityMessage: {
    findOne: vi.fn(),
    find: vi.fn(),
    exists: vi.fn(),
    updateMany: vi.fn(),
  },
}))

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
  evictUserFromCommunity: vi.fn(),
}))

vi.mock("../services/notification.service.js", () => ({
  createNotification: vi.fn(),
}))

import {
  editCommunityMessage,
  unsendCommunityMessage,
  sendCommunityMessage,
  markCommunityMessagesRead,
  reportPossibleScreenshot,
} from "../controllers/chat.controller.js"
import { Community } from "../models/chat.model.js"
import { CommunityMessage } from "../models/communityMessage.model.js"
import User from "../models/user.model.js"
import { recordPossibleScreenshot as mockRecordPossibleScreenshot } from "../sockets/chatSocket.js"

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

describe("Chat – Community Messages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("editCommunityMessage", () => {
    function makeMockMessage(opts = {}) {
      return {
        _id: "msg123",
        sender: { toString: () => opts.senderId ?? "user123" },
        content: opts.content ?? "original",
        createdAt: opts.createdAt ?? new Date(),
        unsent: opts.unsent ?? false,
        editCount: opts.editCount ?? 0,
        editHistory: [],
        edited: false,
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockResolvedValue(true),
        toObject: vi.fn().mockReturnValue({ _id: "msg123" }),
        ...opts.msgOverrides,
      }
    }

    function mockMembership(members) {
      Community.findById.mockReturnValue({
        select: vi.fn().mockResolvedValue({ members }),
      })
    }

    it("should reject empty edit content", async () => {
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "msg123" },
        body: { content: "" },
      })
      await editCommunityMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("empty") }) })
      )
    })

    it("should reject non-existent message", async () => {
      CommunityMessage.findOne.mockResolvedValue(null)
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "nonexistent" },
        body: { content: "edited" },
      })
      await editCommunityMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it("should reject editing another user's message", async () => {
      CommunityMessage.findOne.mockResolvedValue(makeMockMessage({ senderId: "otheruser" }))
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "msg123" },
        body: { content: "edited" },
      })
      await editCommunityMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it("should reject editing an unsent message", async () => {
      CommunityMessage.findOne.mockResolvedValue(makeMockMessage({ unsent: true }))
      mockMembership(["user123"])
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "msg123" },
        body: { content: "edited" },
      })
      await editCommunityMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("should edit own message", async () => {
      const message = makeMockMessage({})
      CommunityMessage.findOne.mockResolvedValue(message)
      mockMembership(["user123"])
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "msg123" },
        body: { content: "edited content" },
      })
      await editCommunityMessage(req, res)
      expect(message.save).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it("should reject editing after being removed from the community", async () => {
      CommunityMessage.findOne.mockResolvedValue(makeMockMessage({}))
      mockMembership([])
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "msg123" },
        body: { content: "edited" },
      })
      await editCommunityMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })
  })

  describe("unsendCommunityMessage", () => {
    function makeMockMessage(opts = {}) {
      return {
        _id: "msg123",
        sender: { toString: () => opts.senderId ?? "user123" },
        content: "original",
        createdAt: new Date(),
        unsent: false,
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockResolvedValue(true),
        toObject: vi.fn().mockReturnValue({ _id: "msg123" }),
        ...opts.msgOverrides,
      }
    }

    function mockCommunity(opts = {}) {
      Community.findById.mockReturnValue({
        select: vi.fn().mockResolvedValue({
          members: opts.members ?? ["user123"],
          moderators: opts.moderators ?? [],
          owner: opts.owner ?? "someowner",
        }),
      })
    }

    it("should reject non-existent message", async () => {
      CommunityMessage.findOne.mockResolvedValue(null)
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "nonexistent" },
      })
      await unsendCommunityMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it("should reject unsending another user's message", async () => {
      CommunityMessage.findOne.mockResolvedValue(makeMockMessage({ senderId: "otheruser" }))
      mockCommunity({})
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "msg123" },
      })
      await unsendCommunityMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it("should unsend own message", async () => {
      const message = makeMockMessage({})
      CommunityMessage.findOne.mockResolvedValue(message)
      mockCommunity({})
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "msg123" },
      })
      await unsendCommunityMessage(req, res)
      expect(message.save).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Message unsent." })
      )
    })

    it("should reject unsending own message after being removed from the community", async () => {
      CommunityMessage.findOne.mockResolvedValue(makeMockMessage({}))
      mockCommunity({ members: [] })
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "msg123" },
      })
      await unsendCommunityMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it("lets a moderator unsend a member's message even if the moderator didn't send it", async () => {
      const message = makeMockMessage({ senderId: "otheruser" })
      CommunityMessage.findOne.mockResolvedValue(message)
      mockCommunity({ members: ["user123", "otheruser"], moderators: ["user123"] })
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "msg123" },
      })
      await unsendCommunityMessage(req, res)
      expect(message.save).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
    })
  })

  describe("sendCommunityMessage", () => {
    it("should reject whitespace-only content", async () => {
      const { req, res } = mockReqRes({
        params: { communityId: "comm123" },
        body: { content: "   " },
      })
      await sendCommunityMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(Community.findById).not.toHaveBeenCalled()
    })
  })

  describe("markCommunityMessagesRead", () => {
    it("should reject a non-member", async () => {
      Community.findById.mockReturnValue({
        select: vi.fn().mockResolvedValue({ _id: "comm123", members: ["otheruser"] }),
      })
      const { req, res } = mockReqRes({
        params: { communityId: "comm123" },
      })
      await markCommunityMessagesRead(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it("should allow a member to mark messages read", async () => {
      Community.findById.mockReturnValue({
        select: vi.fn().mockResolvedValue({ _id: "comm123", members: ["user123"] }),
      })
      CommunityMessage.updateMany.mockResolvedValue({})
      const { req, res } = mockReqRes({
        params: { communityId: "comm123" },
      })
      await markCommunityMessagesRead(req, res)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(CommunityMessage.updateMany).toHaveBeenCalledWith(
        { community: "comm123" },
        { $addToSet: { readBy: "user123" } },
      )
    })
  })

  describe("reportPossibleScreenshot", () => {
    it("should reject a missing recipientId", async () => {
      const { req, res } = mockReqRes({ body: {} })
      await reportPossibleScreenshot(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("recipientId") }) })
      )
    })

    it("should surface the rate limit as 429", async () => {
      mockRecordPossibleScreenshot.mockResolvedValue({ limited: true })
      const { req, res } = mockReqRes({
        body: { recipientId: "user456" },
      })
      await reportPossibleScreenshot(req, res)
      expect(res.status).toHaveBeenCalledWith(429)
    })

    it("should reject an invalid recipient", async () => {
      mockRecordPossibleScreenshot.mockResolvedValue({ invalid: true })
      const { req, res } = mockReqRes({
        body: { recipientId: "user456" },
      })
      await reportPossibleScreenshot(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("should return the persisted notice on success", async () => {
      User.findById.mockResolvedValue({ firstName: "Alex", username: "alex" })
      mockRecordPossibleScreenshot.mockResolvedValue({
        notice: { type: "possible_screenshot", conversationId: "user456" },
      })
      const { req, res } = mockReqRes({
        body: { recipientId: "user456" },
      })
      await reportPossibleScreenshot(req, res)
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ type: "possible_screenshot" })
      )
      expect(mockRecordPossibleScreenshot).toHaveBeenCalledWith(
        expect.objectContaining({ initiatorId: "user123", peerId: "user456" })
      )
    })
  })
})
