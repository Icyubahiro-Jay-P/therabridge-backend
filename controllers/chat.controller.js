import { Message, Community } from "../models/chat.model.js";
import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";
import crypto from "crypto";
import sharp from "sharp";
import { recordPossibleScreenshot, emitToUser, emitToCommunity } from "../sockets/chatSocket.js";
import { awardMessagePoints, MESSAGE_POINTS } from "../utils/points.js";
import { withTransaction } from "../utils/transactions.js";
import { createNotification } from "../services/notification.service.js";
import {
  getPaginationParams,
  formatPaginatedResponse,
  getCursorPaginationParams,
  formatCursorPaginatedResponse,
} from "../utils/pagination.js";
import { encryptField, decryptField } from "../utils/crypto.js";
import { uploadAudioToCloudinary } from "../utils/cloudinary.js";

// Encrypted fields are decrypted on read so the API contract stays plaintext.
const decryptMessageContent = (doc) => {
  if (!doc) return doc;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    ...obj,
    content: decryptField(obj.content),
    editHistory: (obj.editHistory || []).map((h) => ({
      ...h,
      content: decryptField(h.content),
    })),
  };
};

const decryptCommunityMessageContent = (doc) => {
  if (!doc) return doc;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    ...obj,
    content: decryptField(obj.content),
  };
};

// ====================== DIRECT MESSAGES ======================

export const sendMessage = async (req, res) => {
  try {
    const { recipientId, content, replyToMessageId } = req.body;

    if (!content || content.trim() === "") {
      return res
        .status(400)
        .json({ error: { message: "Message content cannot be empty.", code: "BAD_REQUEST" } });
    }

    if (recipientId === req.user.id) {
      return res
        .status(400)
        .json({ error: { message: "Cannot send message to yourself.", code: "BAD_REQUEST" } });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ error: { message: "Recipient not found.", code: "NOT_FOUND" } });
    }

    if (recipient.isDisabled) {
      return res.status(403).json({ error: { message: "This user has been disabled and cannot receive messages.", code: "USER_DISABLED" } });
    }

    // Build reply-to snapshot if replying to a message
    let replyToSnapshot = undefined;
    if (replyToMessageId) {
      const original = await Message.findById(replyToMessageId)
        .populate("sender", "username firstName lastName avatar");
      if (original && !original.unsent) {
        const origObj = original.toObject();
        replyToSnapshot = {
          _id: origObj._id,
          senderUsername: origObj.sender?.username || "",
          senderAvatar: origObj.sender?.avatar || null,
          content: decryptField(origObj.content).slice(0, 150),
          type: origObj.type || "text",
        };
      }
    }

    const message = new Message({
      sender: req.user.id,
      recipient: recipientId,
      content: encryptField(content.trim()),
      ...(replyToSnapshot && { replyTo: replyToSnapshot }),
    });

    // Message + Talking Points award are committed atomically so a crash can't
    // leave the message stored without its points (or vice versa).
    const pointsEarned = await withTransaction(async (session) => {
      await message.save(session ? { session } : undefined);
      return awardMessagePoints(req.user.id, MESSAGE_POINTS.direct, session);
    });

    await message.populate("sender", "username firstName lastName avatar");
    await message.populate("recipient", "username firstName lastName avatar");

    const messageObj = decryptMessageContent(message.toObject());
    emitToUser(recipientId, "dm_message", messageObj);
    emitToUser(recipientId, "conversations_updated", {
      partnerId: req.user.id,
    });
    emitToUser(req.user.id, "conversations_updated", {
      partnerId: recipientId,
    });

    // In-app + device notification for the recipient (skipped while they're
    // actively connected, since the socket event already updates the UI).
    const sender = messageObj.sender || {};
    const plaintext = content.trim();
    await createNotification(
      recipientId,
      "message",
      sender.firstName || sender.username || "New message",
      plaintext,
      { url: sender.username ? `/chat/${sender.username}` : "/chat" },
      req.user.id,
      { skipIfOnline: true },
    );

    res.status(201).json({ ...messageObj, pointsEarned });
  } catch (error) {
    throw error;
  }
};

const LONG_POLL_INTERVAL_MS = 1000;
const LONG_POLL_TIMEOUT_MS = 30000;
const INITIAL_CATCHUP_WINDOW_MS = 30000;

const populateConversationMessages = (query) =>
  query
    .populate("sender", "username firstName lastName avatar")
    .populate("recipient", "username firstName lastName avatar");

const conversationFilter = (myId, userId) => ({
  $or: [
    { sender: myId, recipient: userId },
    { sender: userId, recipient: myId },
  ],
  deletedFor: { $ne: myId },
});

const getLatestConversationTimestamp = async (myId, userId) => {
  const latestMessage = await Message.findOne({
    $or: [
      { sender: myId, recipient: userId },
      { sender: userId, recipient: myId },
    ],
    deletedFor: { $ne: myId },
  })
    .sort({ updatedAt: -1 })
    .select("updatedAt")
    .lean();

  return latestMessage?.updatedAt;
};

const waitForConversationUpdate = async (myId, userId, since) => {
  if (!since) return true;
  const sinceDate = new Date(since);
  if (Number.isNaN(sinceDate.getTime())) return true;

  const initialTimestamp = await getLatestConversationTimestamp(myId, userId);
  if (initialTimestamp && initialTimestamp > sinceDate) {
    return true;
  }

  const deadline = Date.now() + LONG_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, LONG_POLL_INTERVAL_MS));
    const updatedTimestamp = await getLatestConversationTimestamp(myId, userId);
    if (updatedTimestamp && updatedTimestamp > sinceDate) {
      return true;
    }
  }

  return false;
};

export const getConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    const myId = req.user.id;

    const { cursor, limit } = getCursorPaginationParams(req.query, 100);

    let messages;
    let nextCursor = null;

    if (cursor) {
      const fetched = await populateConversationMessages(
        Message.find({
          ...conversationFilter(myId, userId),
          _id: { $lt: cursor },
        })
          .sort({ _id: -1 })
          .limit(limit + 1),
      );

      const hasMore = fetched.length > limit;
      if (hasMore) fetched.pop();

      // Return oldest-first for display; nextCursor still points at the oldest
      // message so subsequent "load older" calls (cursor with _id $lt) work.
      nextCursor = hasMore ? fetched[fetched.length - 1]?._id : null;
      messages = fetched.reverse();
    } else {
      // Initial load: all unread messages plus a limited number of recent
      // read messages, so the UI never dumps the full history at once.
      const [recent, unread] = await Promise.all([
        populateConversationMessages(
          Message.find(conversationFilter(myId, userId))
            .sort({ _id: -1 })
            .limit(limit),
        ),
        populateConversationMessages(
          Message.find({
            ...conversationFilter(myId, userId),
            sender: userId,
            recipient: myId,
            read: false,
          }).sort({ _id: 1 }),
        ),
      ]);

      const byId = new Map();
      for (const msg of recent) byId.set(msg._id.toString(), msg);
      for (const msg of unread) byId.set(msg._id.toString(), msg);
      messages = [...byId.values()].sort((a, b) =>
        a._id.toString() < b._id.toString() ? -1 : 1,
      );

      if (messages.length > 0) {
        const oldestId = messages[0]._id;
        const hasOlder = await Message.exists({
          ...conversationFilter(myId, userId),
          _id: { $lt: oldestId },
        });
        nextCursor = hasOlder ? oldestId : null;
      }
    }

    const myUser = await User.findById(myId).select("chatSettings");
    if (myUser?.chatSettings?.readReceipts !== false) {
      await Message.updateMany(
        { sender: userId, recipient: myId, read: false },
        { $set: { read: true, readAt: new Date() } },
      );
    }

    res.status(200).json(
      formatCursorPaginatedResponse(
        messages.map(decryptMessageContent),
        limit,
        nextCursor,
      ),
    );
  } catch (error) {
    throw error;
  }
};

// Explicit mark-read action fired when the reader opens a DM thread (and when
// new messages arrive while the thread is open). Updates the persisted read
// state so `GET /api/chat/conversations` unread counts reflect it, clears the
// in-app notification bell for that sender, and emits `conversations_updated`
// to the reader's OWN user room so every tab/session stays in sync.
export const markConversationRead = async (req, res) => {
  try {
    const { userId } = req.params;
    const myId = req.user.id;

    const peer = await User.findById(userId);
    if (!peer) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND" } });
    }

    const myUser = await User.findById(myId).select("chatSettings");
    let markedRead = 0;

    // Match the existing read-receipts contract in `getConversation`: when the
    // reader disabled read receipts we don't flip the sender-visible `read`
    // flag, but we still clear their own notification bell.
    if (myUser?.chatSettings?.readReceipts !== false) {
      const result = await Message.updateMany(
        { sender: userId, recipient: myId, read: false },
        { $set: { read: true, readAt: new Date() } },
      );
      markedRead = result.modifiedCount || 0;
    }

    // Clear unread in-app notifications from this sender (the bell).
    await Notification.updateMany(
      { recipient: myId, sender: userId, read: false, type: "message" },
      { $set: { read: true, readAt: new Date() } },
    );

    // Sync the reader's own other sessions/tabs so unread badges settle.
    emitToUser(myId, "conversations_updated", { partnerId: userId });

    res.status(200).json({ message: "Conversation marked as read.", markedRead });
  } catch (error) {
    throw error;
  }
};

export const getConversationUpdates = async (req, res) => {
  try {
    const { userId } = req.params;
    const myId = req.user.id;
    const { since } = req.query;

    const lastUpdated = await getLatestConversationTimestamp(myId, userId);
    if (lastUpdated) {
      res.set("X-Last-Updated", lastUpdated.toISOString());
    }

    if (!since) {
      // Fresh listener: only return messages from a short catch-up window so
      // the client merges anything missed between the initial load and the
      // first poll without dumping the full history into the UI.
      const sinceDate = new Date(Date.now() - INITIAL_CATCHUP_WINDOW_MS);
      const messages = await populateConversationMessages(
        Message.find({
          ...conversationFilter(myId, userId),
          updatedAt: { $gt: sinceDate },
        }).sort({ createdAt: 1 }),
      );
      return res.status(200).json(messages.map(decryptMessageContent));
    }

    const hasUpdates = await waitForConversationUpdate(myId, userId, since);
    if (!hasUpdates) {
      return res.status(204).end();
    }

    const sinceDate = new Date(since);
    if (Number.isNaN(sinceDate.getTime())) {
      return res.status(200).json([]);
    }

    const messages = await populateConversationMessages(
      Message.find({
        ...conversationFilter(myId, userId),
        updatedAt: { $gt: sinceDate },
      }).sort({ createdAt: 1 }),
    );

    res.status(200).json(messages.map(decryptMessageContent));
  } catch (error) {
    throw error;
  }
};

export const getMyConversations = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query, 50);
    const myId = req.user.id;
    const myObjectId = new (await import("mongoose")).default.Types.ObjectId(myId);

    // Use aggregation to find latest message per conversation partner + unread count
    // in a single pipeline instead of N+1 queries
    const conversations = await Message.aggregate([
      // Match messages involving the current user that haven't been deleted for them
      {
        $match: {
          $or: [{ sender: myObjectId }, { recipient: myObjectId }],
          deletedFor: { $ne: myObjectId },
        },
      },
      // Sort by createdAt descending so the first message per partner is the latest
      { $sort: { createdAt: -1 } },
      // Group by conversation partner, keeping the latest message and counting unread
      {
        $group: {
          _id: {
            $cond: [{ $eq: ["$sender", myObjectId] }, "$recipient", "$sender"],
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$recipient", myObjectId] },
                    { $eq: ["$read", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      // Sort conversations by latest message
      { $sort: { "lastMessage.createdAt": -1 } },
      // Skip and limit for pagination
      { $skip: offset },
      { $limit: limit },
    ]);

    // Get total count of conversations
    const totalCount = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: myObjectId }, { recipient: myObjectId }],
          deletedFor: { $ne: myObjectId },
        },
      },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ["$sender", myObjectId] }, "$recipient", "$sender"],
          },
        },
      },
      { $count: "count" },
    ]);

    const total = totalCount[0]?.count || 0;

    // Populate user details for partners
    const partnerIds = conversations.map((c) => c._id);
    const partners = await User.find({ _id: { $in: partnerIds } })
      .select("username firstName lastName avatar isDisabled");
    const partnerMap = new Map(partners.map((p) => [p._id.toString(), p]));

    const result = conversations.map((c) => ({
      partner: partnerMap.get(c._id.toString()),
      lastMessage: decryptMessageContent(c.lastMessage),
      unread: c.unreadCount,
    }));

    res
      .status(200)
      .json(
        formatPaginatedResponse(result, total, page, limit),
      );
  } catch (error) {
    throw error;
  }
};

export const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res
        .status(400)
        .json({ error: { message: "Query must be at least 2 characters.", code: "BAD_REQUEST" } });
    }

    const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const users = await User.find({
      _id: { $ne: req.user.id },
      $or: [
        { username: { $regex: escapedQuery, $options: "i" } },
        { firstName: { $regex: escapedQuery, $options: "i" } },
        { lastName: { $regex: escapedQuery, $options: "i" } },
      ],
    })
      .select("username firstName lastName avatar bio isDisabled")
      .limit(10);

    res.status(200).json(users);
  } catch (error) {
    throw error;
  }
};

export const getSuggestedUsers = async (req, res) => {
  try {
    const myId = req.user.id;

    const messages = await Message.find({
      $or: [{ sender: myId }, { recipient: myId }],
      deletedFor: { $ne: myId },
    }).select("sender recipient");

    const conversationPartnerIds = new Set();
    for (const msg of messages) {
      if (msg.sender?.toString() !== myId) conversationPartnerIds.add(msg.sender?.toString());
      if (msg.recipient?.toString() !== myId) conversationPartnerIds.add(msg.recipient?.toString());
    }

    const users = await User.find({
      _id: { $ne: myId, $nin: [...conversationPartnerIds] },
    })
      .select("username firstName lastName avatar bio isDisabled")
      .sort({ loginStreak: -1, updatedAt: -1 })
      .limit(8);

    res.status(200).json(users);
  } catch (error) {
    throw error;
  }
};

// ====================== COMMUNITY ROOMS ======================

export const createCommunity = async (req, res) => {
  try {
    const { name, description, category, isPrivate, rules } = req.body;

    if (req.user.role !== "therapist" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: { message: "Only therapists and admins can create communities.", code: "FORBIDDEN" } });
    }

    if (!name || name.length < 2) {
      return res
        .status(400)
        .json({ error: { message: "Community name must be at least 2 characters.", code: "BAD_REQUEST" } });
    }

    let community;
    for (let attempts = 0; attempts < 5; attempts++) {
      const inviteKey = crypto.randomBytes(4).toString("hex").toUpperCase();
      community = new Community({
        name: name.trim(),
        description: description?.trim() || "",
        category: category || "general",
        isPrivate: Boolean(isPrivate),
        rules: rules?.trim() || "",
        owner: req.user.id,
        members: [req.user.id],
        inviteKey,
      });
      try {
        await community.save();
        break;
      } catch (err) {
        if (err.code !== 11000 || attempts === 4) throw err;
      }
    }

    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");
    await community.populate("moderators", "username firstName lastName avatar");

    res.status(201).json(community);
  } catch (error) {
    throw error;
  }
};

// Helper: can this user moderate the room? (owner, moderator, or admin)
const canModerate = (community, userId, role) =>
  role === "admin" ||
  community.owner?.toString() === userId ||
  (community.moderators ?? []).some((m) => m?.toString() === userId);

export const joinCommunity = async (req, res) => {
  try {
    const { inviteKey } = req.body;

    const community = await Community.findOne({ inviteKey });
    if (!community) {
      return res
        .status(404)
        .json({ error: { message: "Invalid invite key. Community not found.", code: "NOT_FOUND" } });
    }

    const alreadyMember = community.members.some(
      (m) => m.toString() === req.user.id,
    );
    if (alreadyMember) {
      return res
        .status(400)
        .json({ error: { message: "You are already a member of this community.", code: "BAD_REQUEST" } });
    }

    if (community.isPrivate) {
      const alreadyPending = community.pendingMembers.some(
        (m) => m.toString() === req.user.id,
      );
      if (alreadyPending) {
        return res
          .status(400)
          .json({ error: { message: "Your join request is already pending approval.", code: "BAD_REQUEST" } });
      }
      community.pendingMembers.push(req.user.id);
      await community.save();
      return res
        .status(202)
        .json({ message: "Join request sent. You will be added once a moderator approves.", pending: true });
    }

    community.members.push(req.user.id);
    await community.save();
    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");
    await community.populate("moderators", "username firstName lastName avatar");

    res
      .status(200)
      .json({ message: "Joined community successfully!", community });
  } catch (error) {
    throw error;
  }
};

export const leaveCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    const isOwner = community.owner.toString() === req.user.id;
    if (isOwner) {
      return res.status(400).json({
        error: { message: "As the owner, delete the community or transfer ownership instead of leaving.", code: "BAD_REQUEST" },
      });
    }

    const wasMember = community.members.some((m) => m.toString() === req.user.id);
    if (!wasMember) {
      return res.status(400).json({ error: { message: "You are not a member of this community.", code: "BAD_REQUEST" } });
    }

    community.members = community.members.filter((m) => m.toString() !== req.user.id);
    community.moderators = (community.moderators ?? []).filter((m) => m.toString() !== req.user.id);
    await community.save();

    res.status(200).json({ message: "You left the community." });
  } catch (error) {
    throw error;
  }
};

export const getMyCommunities = async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const filter = isAdmin
      ? {}
      : { $or: [{ members: req.user.id }, { pendingMembers: req.user.id }] };

    const communities = await Community.find(filter)
      .populate("owner", "username firstName lastName avatar")
      .populate("members", "username firstName lastName avatar")
      .populate("moderators", "username firstName lastName avatar")
      .populate("pendingMembers", "username firstName lastName avatar")
      .select("-messages")
      .sort({ updatedAt: -1 });

    res.status(200).json(communities);
  } catch (error) {
    throw error;
  }
};

const fetchCommunityMessages = async (communityId, userId) => {
  const community = await Community.findById(communityId)
    .populate("messages.sender", "username firstName lastName avatar")
    .populate("owner", "username firstName lastName avatar")
    .populate("members", "username firstName lastName avatar")
    .populate("moderators", "username firstName lastName avatar")
    .populate("pendingMembers", "username firstName lastName avatar");

  if (!community) return null;

  const isMember = community.members.some((m) => m._id.toString() === userId);
  if (!isMember) return null;

  // Decrypt community message content before it leaves the server.
  community.messages = community.messages.map(decryptCommunityMessageContent);

  return community;
};

const getLatestCommunityTimestamp = async (communityId) => {
  const community = await Community.findById(communityId)
    .select("updatedAt")
    .lean();

  return community?.updatedAt;
};

const waitForCommunityUpdate = async (communityId, since) => {
  if (!since) return true;
  const sinceDate = new Date(since);
  if (Number.isNaN(sinceDate.getTime())) return true;

  const initialTimestamp = await getLatestCommunityTimestamp(communityId);
  if (initialTimestamp && initialTimestamp > sinceDate) {
    return true;
  }

  const deadline = Date.now() + LONG_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, LONG_POLL_INTERVAL_MS));
    const updatedTimestamp = await getLatestCommunityTimestamp(communityId);
    if (updatedTimestamp && updatedTimestamp > sinceDate) {
      return true;
    }
  }

  return false;
};

export const getCommunityMessages = async (req, res) => {
  try {
    const { communityId } = req.params;

    const community = await fetchCommunityMessages(communityId, req.user.id);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    const lastUpdated = await getLatestCommunityTimestamp(communityId);
    if (lastUpdated) {
      res.set("X-Last-Updated", lastUpdated.toISOString());
    }

    res.status(200).json(community);
  } catch (error) {
    throw error;
  }
};

export const getCommunityUpdates = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { since } = req.query;

    if (!since) {
      const community = await fetchCommunityMessages(communityId, req.user.id);
      if (!community) {
        return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
      }
      const lastUpdated = await getLatestCommunityTimestamp(communityId);
      if (lastUpdated) {
        res.set("X-Last-Updated", lastUpdated.toISOString());
      }
      return res.status(200).json(community);
    }

    const hasUpdates = await waitForCommunityUpdate(communityId, since);
    if (!hasUpdates) {
      return res.status(204).end();
    }

    const community = await fetchCommunityMessages(communityId, req.user.id);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    const lastUpdated = await getLatestCommunityTimestamp(communityId);
    if (lastUpdated) {
      res.set("X-Last-Updated", lastUpdated.toISOString());
    }

    res.status(200).json(community);
  } catch (error) {
    throw error;
  }
};

export const sendCommunityMessage = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { content, replyToMessageId } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    const isMember = community.members.some(
      (m) => m.toString() === req.user.id,
    );
    if (!isMember) {
      return res
        .status(403)
        .json({ error: { message: "You are not a member of this community.", code: "FORBIDDEN" } });
    }

    if (community.isDisabled) {
      return res
        .status(403)
        .json({ error: { message: "This community has been disabled. Messaging is disabled.", code: "COMMUNITY_DISABLED" } });
    }

    // Build reply-to snapshot if replying to a message
    let replyToSnapshot = undefined;
    if (replyToMessageId) {
      const original = community.messages.id(replyToMessageId);
      if (original && !original.unsent) {
        const origSender = await User.findById(original.sender).select("username avatar");
        replyToSnapshot = {
          _id: original._id,
          senderUsername: origSender?.username || "",
          senderAvatar: origSender?.avatar || null,
          content: decryptField(original.content).slice(0, 150),
          type: original.type || "text",
        };
      }
    }

    community.messages.push({
      sender: req.user.id,
      content: encryptField(content.trim()),
      ...(replyToSnapshot && { replyTo: replyToSnapshot }),
    });

    // Message + Talking Points award committed atomically.
    const pointsEarned = await withTransaction(async (session) => {
      await community.save(session ? { session } : undefined);
      return awardMessagePoints(req.user.id, MESSAGE_POINTS.community, session);
    });

    const updatedCommunity = await Community.findById(communityId).populate(
      "messages.sender",
      "username firstName lastName avatar",
    );

    const newMessage =
      updatedCommunity.messages[updatedCommunity.messages.length - 1];

    const messageObj = decryptCommunityMessageContent(
      newMessage.toObject(),
    );

    emitToCommunity(communityId, "community_message", {
      communityId,
      message: messageObj,
    });

    // In-app + device notification for every other member (skipped while
    // they're actively connected, since the socket event already updates UI).
    const sender = messageObj.sender || {};
    const senderName =
      sender.firstName || sender.username || "Someone";
    const memberIds = (community.members || [])
      .map((m) => m.toString())
      .filter((id) => id !== req.user.id);

    const plaintext = content.trim();
    for (const memberId of memberIds) {
      await createNotification(
        memberId,
        "community_update",
        `${senderName} · ${community.name}`,
        plaintext,
        {
          url: community.inviteKey
            ? `/community/${community.inviteKey}`
            : "/community",
        },
        req.user.id,
        { skipIfOnline: true },
      );
    }

    res.status(201).json({ ...messageObj, pointsEarned });
  } catch (error) {
    throw error;
  }
};

// ====================== COMMUNITY MANAGEMENT ======================

export const updateCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { name, description, category, isPrivate, rules } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    if (community.owner.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ error: { message: "Only the owner can update this community.", code: "FORBIDDEN" } });
    }

    if (name) {
      community.name = name.trim();
    }

    if (description !== undefined) {
      community.description = description.trim();
    }

    if (category !== undefined) {
      const categories = [
        "general", "anxiety", "depression", "stress",
        "mindfulness", "support", "therapy", "wellness",
      ];
      if (!categories.includes(category)) {
        return res.status(400).json({ error: { message: "Invalid category.", code: "BAD_REQUEST" } });
      }
      community.category = category;
    }

    if (isPrivate !== undefined) {
      community.isPrivate = Boolean(isPrivate);
    }

    if (rules !== undefined) {
      community.rules = rules.trim();
    }

    await community.save();
    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");
    await community.populate("moderators", "username firstName lastName avatar");
    await community.populate("pendingMembers", "username firstName lastName avatar");

    res.status(200).json(community);
  } catch (error) {
    throw error;
  }
};

export const removeMember = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { userId } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    const canAct = canModerate(community, req.user.id, req.user.role);
    if (!canAct) {
      return res.status(403).json({
        error: { message: "Only moderators, therapists, or admins can remove members.", code: "FORBIDDEN" },
      });
    }

    if (userId === req.user.id && req.user.role !== "admin") {
      return res.status(400).json({ error: { message: "Use 'Leave community' to remove yourself.", code: "BAD_REQUEST" } });
    }

    if (community.owner.toString() === userId && req.user.role !== "admin") {
      return res.status(400).json({ error: { message: "You cannot remove the owner.", code: "BAD_REQUEST" } });
    }

    community.members = community.members.filter(
      (m) => m.toString() !== userId,
    );
    community.moderators = (community.moderators ?? []).filter(
      (m) => m.toString() !== userId,
    );
    community.pendingMembers = (community.pendingMembers ?? []).filter(
      (m) => m.toString() !== userId,
    );

    await community.save();

    res.status(200).json({ message: "Member removed successfully." });
  } catch (error) {
    throw error;
  }
};

export const inviteMember = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { userId } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    if (!canModerate(community, req.user.id, req.user.role)) {
      return res.status(403).json({
        error: { message: "Only moderators or the owner can invite members.", code: "FORBIDDEN" },
      });
    }

    const target = await User.findById(userId);
    if (!target) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND" } });
    }

    // Therapists may only invite the users they manage
    if (req.user.role === "therapist") {
      const managesUser = target.therapist?.toString() === req.user.id;
      if (!managesUser) {
        return res.status(403).json({
          error: { message: "Therapists can only invite users they manage.", code: "FORBIDDEN" },
        });
      }
    }

    if (community.members.some((m) => m.toString() === userId)) {
      return res.status(400).json({ error: { message: "This user is already a member.", code: "BAD_REQUEST" } });
    }

    community.pendingMembers = (community.pendingMembers ?? []).filter(
      (m) => m.toString() !== userId,
    );
    community.members.push(userId);
    await community.save();
    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");
    await community.populate("moderators", "username firstName lastName avatar");
    await community.populate("pendingMembers", "username firstName lastName avatar");

    res.status(200).json({ message: "Member invited successfully!", community });
  } catch (error) {
    throw error;
  }
};

export const getJoinRequests = async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await Community.findById(communityId)
      .populate("pendingMembers", "username firstName lastName avatar bio");
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }
    if (!canModerate(community, req.user.id, req.user.role)) {
      return res.status(403).json({
        error: { message: "Only moderators can view join requests.", code: "FORBIDDEN" },
      });
    }
    res.status(200).json(community.pendingMembers);
  } catch (error) {
    throw error;
  }
};

export const respondToJoinRequest = async (req, res) => {
  try {
    const { communityId, userId } = req.params;
    const { action } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }
    if (!canModerate(community, req.user.id, req.user.role)) {
      return res.status(403).json({
        error: { message: "Only moderators can approve or reject join requests.", code: "FORBIDDEN" },
      });
    }

    const isPending = (community.pendingMembers ?? []).some(
      (m) => m.toString() === userId,
    );
    if (!isPending) {
      return res.status(400).json({ error: { message: "No pending request from this user.", code: "BAD_REQUEST" } });
    }

    community.pendingMembers = community.pendingMembers.filter(
      (m) => m.toString() !== userId,
    );

    let message;
    if (action === "approve") {
      if (!community.members.some((m) => m.toString() === userId)) {
        community.members.push(userId);
      }
      message = "Join request approved. User added to the community.";
    } else if (action === "reject") {
      message = "Join request rejected.";
    } else {
      return res.status(400).json({ error: { message: "Action must be 'approve' or 'reject'.", code: "BAD_REQUEST" } });
    }

    await community.save();
    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");
    await community.populate("moderators", "username firstName lastName avatar");
    await community.populate("pendingMembers", "username firstName lastName avatar");

    res.status(200).json({ message, community });
  } catch (error) {
    throw error;
  }
};

export const addModerator = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { userId } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }
    if (community.owner.toString() !== req.user.id) {
      return res.status(403).json({
        error: { message: "Only the owner can appoint moderators.", code: "FORBIDDEN" },
      });
    }
    if (!community.members.some((m) => m.toString() === userId)) {
      return res.status(400).json({ error: { message: "User must be a member first.", code: "BAD_REQUEST" } });
    }
    if ((community.moderators ?? []).some((m) => m.toString() === userId)) {
      return res.status(400).json({ error: { message: "This user is already a moderator.", code: "BAD_REQUEST" } });
    }

    community.moderators.push(userId);
    await community.save();
    await community.populate("moderators", "username firstName lastName avatar");

    res.status(200).json({ message: "Moderator added.", moderators: community.moderators });
  } catch (error) {
    throw error;
  }
};

export const removeModerator = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { userId } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }
    if (community.owner.toString() !== req.user.id) {
      return res.status(403).json({
        error: { message: "Only the owner can remove moderators.", code: "FORBIDDEN" },
      });
    }

    community.moderators = (community.moderators ?? []).filter(
      (m) => m.toString() !== userId,
    );
    await community.save();
    await community.populate("moderators", "username firstName lastName avatar");

    res.status(200).json({ message: "Moderator removed.", moderators: community.moderators });
  } catch (error) {
    throw error;
  }
};

export const getCommunityByKey = async (req, res) => {
  try {
    const { inviteKey } = req.params;

    const community = await Community.findOne({
      inviteKey: inviteKey.toUpperCase(),
    })
      .populate("messages.sender", "username firstName lastName avatar")
      .populate("owner", "username firstName lastName avatar")
      .populate("members", "username firstName lastName avatar")
      .populate("moderators", "username firstName lastName avatar")
      .populate("pendingMembers", "username firstName lastName avatar");

    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    const isMember = community.members.some(
      (m) => m._id.toString() === req.user.id,
    );
    if (!isMember) {
      return res
        .status(403)
        .json({ error: { message: "You are not a member of this community.", code: "FORBIDDEN" } });
    }

    res.status(200).json(community);
  } catch (error) {
    throw error;
  }
};

export const markCommunityMessagesRead = async (req, res) => {
  try {
    const { communityId } = req.params;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    let updated = false;
    for (const msg of community.messages) {
      if (!msg.readBy.includes(req.user.id)) {
        msg.readBy.push(req.user.id);
        updated = true;
      }
    }

    if (updated) {
      await community.save();
    }

    res.status(200).json({ message: "Messages marked as read." });
  } catch (error) {
    throw error;
  }
};

export const deleteAllMyMessages = async (req, res) => {
  try {
    const myId = req.user.id;

    const result = await Message.updateMany(
      {
        $or: [{ sender: myId }, { recipient: myId }],
        deletedFor: { $ne: myId },
      },
      { $push: { deletedFor: myId } },
    );

    res.status(200).json({
      message: `Deleted ${result.modifiedCount} messages from your view.`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    throw error;
  }
};

export const unsendMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const myId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: { message: "Message not found.", code: "NOT_FOUND" } });
    }

    if (message.sender.toString() !== myId) {
      return res
        .status(403)
        .json({ error: { message: "You can only unsend your own messages.", code: "FORBIDDEN" } });
    }

    message.unsent = true;
    message.content = encryptField("Message unsent");
    await message.save();

    emitToUser(myId, "dm_message_unsent", { messageId });
    emitToUser(message.recipient.toString(), "dm_message_unsent", {
      messageId,
    });

    res.status(200).json({
      message: "Message unsent.",
      unsentMessage: decryptMessageContent(message),
    });
  } catch (error) {
    throw error;
  }
};

// ====================== PRIVACY SHIELD ======================

// REST fallback for possible-screenshot notices when the client's socket is
// not connected. Same rate limit + persistence + socket push as the
// "possible_screenshot" socket event.
export const reportPossibleScreenshot = async (req, res) => {
  try {
    const { recipientId } = req.body;
    if (!recipientId || typeof recipientId !== "string") {
      return res
        .status(400)
        .json({ error: { message: "recipientId is required.", code: "BAD_REQUEST" } });
    }

    const me = await User.findById(req.user.id);
    const result = await recordPossibleScreenshot({
      initiatorId: req.user.id,
      initiatorName: me?.firstName || me?.username || "Someone",
      peerId: recipientId,
    });

    if (result.limited) {
      return res.status(429).json({ message: "Rate limited. Please wait a moment." });
    }
    if (result.invalid) {
      return res
        .status(400)
        .json({ error: { message: "Invalid recipient.", code: "BAD_REQUEST" } });
    }

    res.status(201).json(result.notice);
  } catch (error) {
    throw error;
  }
};

const escapeSvgText = (text) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Optional server-side per-viewer stamp. Renders the given text on a canvas
// with a tiled, low-opacity "<viewerId> · <timestamp>" watermark and returns a
// PNG. This is a deterrence/paper-trail aid - it does NOT prevent screenshots.
export const generateWatermarkStamp = async (req, res) => {
  try {
    const { text, viewerId } = req.body;
    if (!text || typeof text !== "string" || text.trim() === "") {
      return res
        .status(400)
        .json({ error: { message: "text is required.", code: "BAD_REQUEST" } });
    }
    if (!viewerId || typeof viewerId !== "string") {
      return res
        .status(400)
        .json({ error: { message: "viewerId is required.", code: "BAD_REQUEST" } });
    }

    const safeText = escapeSvgText(text.slice(0, 2000));
    const stamp = `${escapeSvgText(viewerId)} · ${new Date().toISOString()}`;
    const width = 640;
    const height = Math.min(480, 120 + Math.ceil(safeText.length / 80) * 24);

    const tiles = [];
    for (let x = -80; x < width; x += 220) {
      for (let y = -80; y < height; y += 160) {
        tiles.push(
          `<text x="${x}" y="${y}" fill="rgba(120,120,120,0.18)" font-size="14" transform="rotate(-30 ${x} ${y})">${stamp}</text>`,
        );
      }
    }

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <text x="24" y="40" font-family="sans-serif" font-size="16" fill="#111111">${safeText}</text>
        ${tiles.join("")}
      </svg>`;

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    res.set("Content-Type", "image/png");
    res.set("X-Watermark-Stamp", stamp);
    res.set("Cache-Control", "no-store");
    res.status(200).send(png);
  } catch (error) {
    throw error;
  }
};

// ====================== CHAT SETTINGS ======================

export const getChatSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("chatSettings");
    res.status(200).json(user.chatSettings);
  } catch (error) {
    throw error;
  }
};

export const updateChatSettings = async (req, res) => {
  try {
    const { chatSettings } = req.body;

    const allowedFields = ["readReceipts"];
    const updates = {};
    for (const field of allowedFields) {
      if (chatSettings[field] !== undefined) {
        if (typeof chatSettings[field] !== "boolean") {
          return res
            .status(400)
            .json({ error: { message: `${field} must be a boolean.`, code: "VALIDATION_ERROR" } });
        }
        updates[`chatSettings.${field}`] = chatSettings[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: { message: "No valid settings provided.", code: "VALIDATION_ERROR" } });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true },
    ).select("chatSettings");

    res.status(200).json({
      message: "Chat settings updated",
      chatSettings: user.chatSettings,
    });
  } catch (error) {
    throw error;
  }
};

export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const myId = req.user.id;

    if (!content || content.trim() === "") {
      return res
        .status(400)
        .json({ error: { message: "Message content cannot be empty.", code: "BAD_REQUEST" } });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: { message: "Message not found.", code: "NOT_FOUND" } });
    }

    if (message.sender.toString() !== myId) {
      return res
        .status(403)
        .json({ error: { message: "You can only edit your own messages.", code: "FORBIDDEN" } });
    }

    if (message.unsent) {
      return res
        .status(400)
        .json({ error: { message: "Cannot edit an unsent message.", code: "BAD_REQUEST" } });
    }

    if (message.editCount >= 3) {
      return res
        .status(400)
        .json({ error: { message: "Maximum of 3 edits per message.", code: "BAD_REQUEST" } });
    }

    const tenMinutes = 10 * 60 * 1000;
    const age = Date.now() - new Date(message.createdAt).getTime();
    if (age > tenMinutes) {
      return res
        .status(400)
        .json({ error: { message: "Can only edit messages within 10 minutes.", code: "BAD_REQUEST" } });
    }

    message.editHistory.push({
      content: message.content,
      editedAt: new Date(),
    });
    message.content = encryptField(content.trim());
    message.edited = true;
    message.editCount += 1;

    await message.save();
    await message.populate("sender", "username firstName lastName avatar");
    await message.populate("recipient", "username firstName lastName avatar");

    const editedMessage = decryptMessageContent(message.toObject());
    emitToUser(myId, "dm_message_updated", editedMessage);
    emitToUser(message.recipient.toString(), "dm_message_updated", editedMessage);

    res.status(200).json(editedMessage);
  } catch (error) {
    throw error;
  }
};

// ====================== COMMUNITY MESSAGE EDIT / UNSEND ======================

export const editCommunityMessage = async (req, res) => {
  try {
    const { communityId, messageId } = req.params;
    const { content } = req.body;
    const myId = req.user.id;

    if (!content || content.trim() === "") {
      return res
        .status(400)
        .json({ error: { message: "Message content cannot be empty.", code: "BAD_REQUEST" } });
    }
    if (content.trim().length > 2000) {
      return res
        .status(400)
        .json({ error: { message: "Message is too long (maximum 2000 characters).", code: "BAD_REQUEST" } });
    }

    const community = await Community.findOne({
      _id: communityId,
      "messages._id": messageId,
    });
    if (!community) {
      return res.status(404).json({ error: { message: "Message not found.", code: "NOT_FOUND" } });
    }

    const message = community.messages.id(messageId);
    if (!message) {
      return res.status(404).json({ error: { message: "Message not found.", code: "NOT_FOUND" } });
    }

    if (message.sender.toString() !== myId) {
      return res
        .status(403)
        .json({ error: { message: "You can only edit your own messages.", code: "FORBIDDEN" } });
    }

    if (message.unsent) {
      return res
        .status(400)
        .json({ error: { message: "Cannot edit an unsent message.", code: "BAD_REQUEST" } });
    }

    if (message.editCount >= 3) {
      return res
        .status(400)
        .json({ error: { message: "Maximum of 3 edits per message.", code: "BAD_REQUEST" } });
    }

    const tenMinutes = 10 * 60 * 1000;
    const age = Date.now() - new Date(message.createdAt).getTime();
    if (age > tenMinutes) {
      return res
        .status(400)
        .json({ error: { message: "Can only edit messages within 10 minutes.", code: "BAD_REQUEST" } });
    }

    message.editHistory.push({
      content: message.content,
      editedAt: new Date(),
    });
    message.content = encryptField(content.trim());
    message.edited = true;
    message.editCount += 1;

    await community.save();
    await community.populate(
      "messages.sender",
      "username firstName lastName avatar",
    );

    const updated = community.messages.id(messageId);
    const updatedObj = decryptCommunityMessageContent(updated.toObject());
    emitToCommunity(communityId, "community_message_updated", {
      communityId,
      message: updatedObj,
    });
    res.status(200).json(updatedObj);
  } catch (error) {
    throw error;
  }
};

export const unsendCommunityMessage = async (req, res) => {
  try {
    const { communityId, messageId } = req.params;
    const myId = req.user.id;

    const community = await Community.findOne({
      _id: communityId,
      "messages._id": messageId,
    });
    if (!community) {
      return res.status(404).json({ error: { message: "Message not found.", code: "NOT_FOUND" } });
    }

    const message = community.messages.id(messageId);
    if (!message) {
      return res.status(404).json({ error: { message: "Message not found.", code: "NOT_FOUND" } });
    }

    const isSender = message.sender.toString() === myId;
    const isModerator = canModerate(community, myId, req.user.role);
    if (!isSender && !isModerator) {
      return res
        .status(403)
        .json({ error: { message: "You can only unsend your own messages.", code: "FORBIDDEN" } });
    }

    message.unsent = true;
    message.content = encryptField("Message removed");
    await community.save();
    await community.populate(
      "messages.sender",
      "username firstName lastName avatar",
    );

    const updated = community.messages.id(messageId);
    const updatedObj = decryptCommunityMessageContent(updated.toObject());
    emitToCommunity(communityId, "community_message_unsent", {
      communityId,
      message: updatedObj,
    });
    res
      .status(200)
      .json({ message: "Message unsent.", unsentMessage: updatedObj });
  } catch (error) {
    throw error;
  }
};

export const deleteCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }
    if (
      req.user.role !== "admin" &&
      community.owner.toString() !== req.user.id
    ) {
      return res.status(403).json({
        error: { message: "Only admins or the owner can delete this community.", code: "FORBIDDEN" },
      });
    }
    await Community.findByIdAndDelete(communityId);
    res.status(200).json({ message: "Community deleted successfully." });
  } catch (error) {
    throw error;
  }
};

export const toggleDisableCommunity = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: { message: "Only admins can disable communities.", code: "FORBIDDEN" } });
    }
    const { communityId } = req.params;
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }
    community.isDisabled = !community.isDisabled;
    await community.save();
    res.status(200).json({ isDisabled: community.isDisabled, message: community.isDisabled ? "Community disabled." : "Community enabled." });
  } catch (error) {
    throw error;
  }
};

export const deleteAllMyCommunityMessages = async (req, res) => {
  try {
    const myId = req.user.id;

    const communities = await Community.find({ members: myId });

    let deletedCount = 0;
    for (const community of communities) {
      const before = community.messages.length;
      community.messages = community.messages.filter(
        (msg) => msg.sender.toString() !== myId,
      );
      deletedCount += before - community.messages.length;
      if (community.messages.length !== before) {
        await community.save();
      }
    }

    res.status(200).json({
      message: `Deleted ${deletedCount} community messages.`,
      deletedCount,
    });
  } catch (error) {
    throw error;
  }
};
