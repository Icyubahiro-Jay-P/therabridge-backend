import { Message, Community } from "../models/chat.model.js";
import User from "../models/user.model.js";
import crypto from "crypto";
import { awardMessagePoints, MESSAGE_POINTS } from "../utils/points.js";
import {
  getPaginationParams,
  formatPaginatedResponse,
  getCursorPaginationParams,
  formatCursorPaginatedResponse,
} from "../utils/pagination.js";

// ====================== DIRECT MESSAGES ======================

export const sendMessage = async (req, res) => {
  try {
    const { recipientId, content } = req.body;

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

    const message = new Message({
      sender: req.user.id,
      recipient: recipientId,
      content: content.trim(),
    });

    await message.save();
    await message.populate("sender", "username firstName lastName avatar");
    await message.populate("recipient", "username firstName lastName avatar");

    const pointsEarned = await awardMessagePoints(
      req.user.id,
      MESSAGE_POINTS.direct,
    );

    res.status(201).json({ ...message.toObject(), pointsEarned });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

const LONG_POLL_INTERVAL_MS = 1000;
const LONG_POLL_TIMEOUT_MS = 30000;

const fetchConversationMessages = async (myId, userId) => {
  return Message.find({
    $or: [
      { sender: myId, recipient: userId },
      { sender: userId, recipient: myId },
    ],
    deletedFor: { $ne: myId },
  })
    .sort({ createdAt: 1 })
    .populate("sender", "username firstName lastName avatar")
    .populate("recipient", "username firstName lastName avatar");
};

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

    let query = {
      $or: [
        { sender: myId, recipient: userId },
        { sender: userId, recipient: myId },
      ],
      deletedFor: { $ne: myId },
    };

    if (cursor) {
      query._id = { $lt: cursor };
    }

    const messages = await Message.find(query)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate("sender", "username firstName lastName avatar")
      .populate("recipient", "username firstName lastName avatar");

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    const nextCursor = hasMore ? messages[messages.length - 1]?._id : null;

    // Return oldest-first for display; nextCursor still points at the oldest
    // message so subsequent "load older" calls (cursor with _id $lt) work.
    messages.reverse();

    const myUser = await User.findById(myId).select("chatSettings");
    if (myUser?.chatSettings?.readReceipts !== false) {
      await Message.updateMany(
        { sender: userId, recipient: myId, read: false },
        { $set: { read: true, readAt: new Date() } },
      );
    }

    res.status(200).json(formatCursorPaginatedResponse(messages, limit, nextCursor));
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

export const getConversationUpdates = async (req, res) => {
  try {
    const { userId } = req.params;
    const myId = req.user.id;
    const { since } = req.query;

    if (!since) {
      const messages = await fetchConversationMessages(myId, userId);
      const lastUpdated = await getLatestConversationTimestamp(myId, userId);
      if (lastUpdated) {
        res.set("X-Last-Updated", lastUpdated.toISOString());
      }
      return res.status(200).json(messages);
    }

    const hasUpdates = await waitForConversationUpdate(myId, userId, since);
    if (!hasUpdates) {
      return res.status(204).end();
    }

    const messages = await fetchConversationMessages(myId, userId);
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

export const getMyConversations = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query, 50);
    const myId = req.user.id;

    const messages = await Message.find({
      $or: [{ sender: myId }, { recipient: myId }],
      deletedFor: { $ne: myId },
    })
      .sort({ createdAt: -1 })
      .populate("sender", "username firstName lastName avatar")
      .populate("recipient", "username firstName lastName avatar");

    const seen = new Set();
    const conversations = [];

    for (const msg of messages) {
      const partner =
        msg.sender._id.toString() === myId ? msg.recipient : msg.sender;
      const partnerId = partner._id.toString();

      if (!seen.has(partnerId)) {
        seen.add(partnerId);
        const unread = await Message.countDocuments({
          sender: partnerId,
          recipient: myId,
          read: false,
        });
        conversations.push({
          partner,
          lastMessage: msg,
          unread,
        });
      }
    }

    const total = conversations.length;
    const paginatedConversations = conversations.slice(offset, offset + limit);

    res
      .status(200)
      .json(
        formatPaginatedResponse(paginatedConversations, total, page, limit),
      );
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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
      .select("username firstName lastName avatar bio")
      .limit(10);

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

export const getSuggestedUsers = async (req, res) => {
  try {
    const myId = req.user.id;

    const users = await User.find({ _id: { $ne: myId } })
      .select("username firstName lastName avatar bio")
      .sort({ loginStreak: -1, updatedAt: -1 })
      .limit(8);

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

// ====================== COMMUNITY ROOMS ======================

export const createCommunity = async (req, res) => {
  try {
    const { name, description } = req.body;

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

    res.status(201).json(community);
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

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

    community.members.push(req.user.id);
    await community.save();
    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");

    res
      .status(200)
      .json({ message: "Joined community successfully!", community });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

export const getMyCommunities = async (req, res) => {
  try {
    const communities = await Community.find({ members: req.user.id })
      .populate("owner", "username firstName lastName avatar")
      .populate("members", "username firstName lastName avatar")
      .select("-messages")
      .sort({ updatedAt: -1 });

    res.status(200).json(communities);
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

const fetchCommunityMessages = async (communityId, userId) => {
  const community = await Community.findById(communityId)
    .populate("messages.sender", "username firstName lastName avatar")
    .populate("owner", "username firstName lastName avatar")
    .populate("members", "username firstName lastName avatar");

  if (!community) return null;

  const isMember = community.members.some((m) => m._id.toString() === userId);
  if (!isMember) return null;

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
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

export const sendCommunityMessage = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { content } = req.body;

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

    community.messages.push({
      sender: req.user.id,
      content: content.trim(),
    });

    await community.save();

    const updatedCommunity = await Community.findById(communityId).populate(
      "messages.sender",
      "username firstName lastName avatar",
    );

    const newMessage =
      updatedCommunity.messages[updatedCommunity.messages.length - 1];

    const pointsEarned = await awardMessagePoints(
      req.user.id,
      MESSAGE_POINTS.community,
    );

    res.status(201).json({ ...newMessage.toObject(), pointsEarned });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

// ====================== COMMUNITY MANAGEMENT ======================

export const updateCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { name, description } = req.body;

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

    await community.save();
    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");

    res.status(200).json(community);
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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

    const isOwner = community.owner.toString() === req.user.id;
    const isAdmin = req.user.role === "admin";
    const isTherapist = req.user.role === "therapist";

    if (!isOwner && !isAdmin && !isTherapist) {
      return res.status(403).json({
        error: { message: "Only the owner, therapists, or admins can remove members.", code: "FORBIDDEN" },
      });
    }

    if (userId === req.user.id && !isAdmin) {
      return res.status(400).json({ error: { message: "You cannot remove yourself.", code: "BAD_REQUEST" } });
    }

    community.members = community.members.filter(
      (m) => m.toString() !== userId,
    );

    await community.save();

    res.status(200).json({ message: "Member removed successfully." });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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
      .populate("members", "username firstName lastName avatar");

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
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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
    message.content = "Message unsent";
    await message.save();

    res
      .status(200)
      .json({ message: "Message unsent.", unsentMessage: message });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

// ====================== CHAT SETTINGS ======================

export const getChatSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("chatSettings");
    res.status(200).json(user.chatSettings);
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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
    message.content = content.trim();
    message.edited = true;
    message.editCount += 1;

    await message.save();
    await message.populate("sender", "username firstName lastName avatar");
    await message.populate("recipient", "username firstName lastName avatar");

    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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
    message.content = content.trim();
    message.edited = true;
    message.editCount += 1;

    await community.save();
    await community.populate(
      "messages.sender",
      "username firstName lastName avatar",
    );

    const updated = community.messages.id(messageId);
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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

    if (message.sender.toString() !== myId) {
      return res
        .status(403)
        .json({ error: { message: "You can only unsend your own messages.", code: "FORBIDDEN" } });
    }

    message.unsent = true;
    message.content = "Message unsent";
    await community.save();
    await community.populate(
      "messages.sender",
      "username firstName lastName avatar",
    );

    const updated = community.messages.id(messageId);
    res
      .status(200)
      .json({ message: "Message unsent.", unsentMessage: updated });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};
