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

vi.mock("../sockets/chatSocket.js", () => ({
  recordPossibleScreenshot: vi.fn(),
}))

import {
  sendMessage,
  editMessage,
  unsendMessage,
  createCommunity,
  joinCommunity,
  leaveCommunity,
  inviteMember,
  respondToJoinRequest,
  deleteCommunity,
  editCommunityMessage,
  unsendCommunityMessage,
  reportPossibleScreenshot,
} from "../controllers/chat.controller.js"
import { Message, Community } from "../models/chat.model.js"
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

describe("Chat Controller", () => {
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
        expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("2") }) })
      )
    })

    it("should reject regular users", async () => {
      const { req, res } = mockReqRes({
        user: { id: "user123", role: "user" },
        body: { name: "My Community" },
      })
      await createCommunity(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("Only therapists and admins") }) })
      )
    })

    it("should allow therapists to create communities", async () => {
      const mockCommunity = {
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockResolvedValue(true),
      }
      Community.mockImplementation(() => mockCommunity)
      const { req, res } = mockReqRes({
        user: { id: "therapist1", role: "therapist" },
        body: { name: "My Community", description: "Test" },
      })
      await createCommunity(req, res)
      expect(Community).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(201)
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
        expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("Invalid") }) })
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
        populate: vi.fn().mockResolvedValue(true),
      })
      const { req, res } = mockReqRes({
        body: { inviteKey: "ABCD1234" },
      })
      await joinCommunity(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("already") }) })
      )
    })

    it("should queue a request for private communities", async () => {
      const push = vi.fn()
      Community.findOne.mockResolvedValue({
        members: ["ownerid"],
        pendingMembers: [],
        isPrivate: true,
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
      expect(res.status).toHaveBeenCalledWith(202)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ pending: true })
      )
    })
  })

  describe("leaveCommunity", () => {
    function makeCommunity(ownerId = "ownerid", members = ["user123"]) {
      return {
        _id: "comm123",
        owner: { toString: () => ownerId },
        members: members.map((m) => ({ toString: () => m })),
        moderators: [],
        save: vi.fn().mockResolvedValue(true),
      }
    }

    it("should reject non-existent community", async () => {
      Community.findById.mockResolvedValue(null)
      const { req, res } = mockReqRes({ params: { communityId: "nope" } })
      await leaveCommunity(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it("should block the owner from leaving", async () => {
      Community.findById.mockResolvedValue(makeCommunity("user123"))
      const { req, res } = mockReqRes({ params: { communityId: "comm123" } })
      await leaveCommunity(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("should remove a regular member", async () => {
      const community = makeCommunity("ownerid")
      Community.findById.mockResolvedValue(community)
      const { req, res } = mockReqRes({ params: { communityId: "comm123" } })
      await leaveCommunity(req, res)
      expect(community.save).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("left") })
      )
    })
  })

  describe("inviteMember", () => {
    function makeCommunity() {
      return {
        _id: "comm123",
        owner: "ownerid",
        moderators: [],
        members: [],
        pendingMembers: [],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockResolvedValue(true),
      }
    }

    it("should block non-moderators from inviting", async () => {
      Community.findById.mockResolvedValue(makeCommunity())
      const { req, res } = mockReqRes({
        params: { communityId: "comm123" },
        body: { userId: "user456" },
      })
      await inviteMember(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it("should reject when the target user does not exist", async () => {
      Community.findById.mockResolvedValue({
        ...makeCommunity(),
        moderators: ["user123"],
      })
      User.findById.mockResolvedValue(null)
      const { req, res } = mockReqRes({
        params: { communityId: "comm123" },
        body: { userId: "user456" },
      })
      await inviteMember(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it("should restrict therapists to the users they manage", async () => {
      Community.findById.mockResolvedValue({
        ...makeCommunity(),
        moderators: ["user123"],
      })
      User.findById.mockResolvedValue({ _id: "user456", role: "user", therapist: "othertherapist" })
      const { req, res } = mockReqRes({
        user: { id: "user123", role: "therapist" },
        params: { communityId: "comm123" },
        body: { userId: "user456" },
      })
      await inviteMember(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("manage") }) })
      )
    })

    it("should add the invited user to members", async () => {
      const community = {
        ...makeCommunity(),
        moderators: ["user123"],
      }
      Community.findById.mockResolvedValue(community)
      User.findById.mockResolvedValue({ _id: "user456", role: "user", therapist: "user123" })
      const { req, res } = mockReqRes({
        user: { id: "user123", role: "therapist" },
        params: { communityId: "comm123" },
        body: { userId: "user456" },
      })
      await inviteMember(req, res)
      expect(community.members).toContain("user456")
      expect(community.save).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
    })
  })

  describe("respondToJoinRequest", () => {
    function makeCommunity() {
      return {
        _id: "comm123",
        owner: "ownerid",
        moderators: ["user123"],
        members: [],
        pendingMembers: [{ toString: () => "user456" }],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockResolvedValue(true),
      }
    }

    it("should reject unknown actions", async () => {
      Community.findById.mockResolvedValue(makeCommunity())
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", userId: "user456" },
        body: { action: "maybe" },
      })
      await respondToJoinRequest(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("should approve a pending request", async () => {
      const community = makeCommunity()
      Community.findById.mockResolvedValue(community)
      const { req, res } = mockReqRes({
        user: { id: "user123", role: "user" },
        params: { communityId: "comm123", userId: "user456" },
        body: { action: "approve" },
      })
      await respondToJoinRequest(req, res)
      expect(community.members).toContain("user456")
      expect(community.pendingMembers).not.toContain("user456")
      expect(res.status).toHaveBeenCalledWith(200)
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

  describe("editCommunityMessage", () => {
    function makeMockCommunity(opts = {}) {
      return {
        _id: "comm123",
        messages: {
          id: vi.fn().mockReturnValue({
            _id: "msg123",
            sender: { toString: () => opts.senderId ?? "user123" },
            content: opts.content ?? "original",
            createdAt: opts.createdAt ?? new Date(),
            unsent: opts.unsent ?? false,
            editCount: opts.editCount ?? 0,
            editHistory: [],
            edited: false,
            ...opts.msgOverrides,
          }),
        },
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockResolvedValue(true),
      }
    }

    it("should reject empty edit content", async () => {
      Community.findOne.mockResolvedValue(makeMockCommunity({}))
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
      Community.findOne.mockResolvedValue(null)
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "nonexistent" },
        body: { content: "edited" },
      })
      await editCommunityMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it("should reject editing another user's message", async () => {
      Community.findOne.mockResolvedValue(makeMockCommunity({ senderId: "otheruser" }))
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "msg123" },
        body: { content: "edited" },
      })
      await editCommunityMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it("should reject editing an unsent message", async () => {
      Community.findOne.mockResolvedValue(makeMockCommunity({ unsent: true }))
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "msg123" },
        body: { content: "edited" },
      })
      await editCommunityMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("should edit own message", async () => {
      const community = makeMockCommunity({})
      Community.findOne.mockResolvedValue(community)
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "msg123" },
        body: { content: "edited content" },
      })
      await editCommunityMessage(req, res)
      expect(community.save).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
    })
  })

  describe("unsendCommunityMessage", () => {
    function makeMockCommunity(opts = {}) {
      return {
        _id: "comm123",
        messages: {
          id: vi.fn().mockReturnValue({
            _id: "msg123",
            sender: { toString: () => opts.senderId ?? "user123" },
            content: "original",
            createdAt: new Date(),
            unsent: false,
            ...opts.msgOverrides,
          }),
        },
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockResolvedValue(true),
      }
    }

    it("should reject non-existent message", async () => {
      Community.findOne.mockResolvedValue(null)
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "nonexistent" },
      })
      await unsendCommunityMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it("should reject unsending another user's message", async () => {
      Community.findOne.mockResolvedValue(makeMockCommunity({ senderId: "otheruser" }))
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "msg123" },
      })
      await unsendCommunityMessage(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it("should unsend own message", async () => {
      const community = makeMockCommunity({})
      Community.findOne.mockResolvedValue(community)
      const { req, res } = mockReqRes({
        params: { communityId: "comm123", messageId: "msg123" },
      })
      await unsendCommunityMessage(req, res)
      expect(community.save).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Message unsent." })
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
