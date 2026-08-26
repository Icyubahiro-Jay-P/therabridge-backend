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
  createCommunity,
  joinCommunity,
  leaveCommunity,
  inviteMember,
  respondToJoinRequest,
  deleteCommunity,
} from "../controllers/chat.controller.js"
import { Community } from "../models/chat.model.js"
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

describe("Chat – Community Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("createCommunity", () => {
    it("should reject short community name", async () => {
      const { req, res } = mockReqRes({
        user: { id: "therapist1", role: "therapist" },
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
      const { req, res } = mockReqRes({
        user: { id: "therapist1", role: "therapist" },
        body: { name: "My Community", description: "Test" },
      })
      await createCommunity(req, res)
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

    it("should return the community when already a member (idempotent)", async () => {
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
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ alreadyMember: true, message: expect.stringContaining("already") })
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
})
