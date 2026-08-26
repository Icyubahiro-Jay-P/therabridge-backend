import { Message } from "../models/chat.model.js";
import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";
import { emitToUser } from "../sockets/chatSocket.js";
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
import {
  decryptMessageContent,
  LONG_POLL_INTERVAL_MS,
  LONG_POLL_TIMEOUT_MS,
  INITIAL_CATCHUP_WINDOW_MS,
} from "./chat.utils.js";

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

    const pointsEarned = await withTransaction(async (session) => {
      await message.save(session ? { session } : undefined);
      return awardMessagePoints(req.user.id, MESSAGE_POINTS.direct, session);
    });

    await message.populate("sender", "username firstName lastName avatar");
    await message.populate("recipient", "username firstName lastName avatar");

    const messageObj = decryptMessageContent(message.toObject());
    emitToUser(recipientId, "dm_message", messageObj);
    emitToUser(recipientId, "conversations_updated", { partnerId: req.user.id });
    emitToUser(req.user.id, "conversations_updated", { partnerId: recipientId });

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

      nextCursor = hasMore ? fetched[fetched.length - 1]?._id : null;
      messages = fetched.reverse();
    } else {
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

    if (myUser?.chatSettings?.readReceipts !== false) {
      const result = await Message.updateMany(
        { sender: userId, recipient: myId, read: false },
        { $set: { read: true, readAt: new Date() } },
      );
      markedRead = result.modifiedCount || 0;
    }

    await Notification.updateMany(
      { recipient: myId, sender: userId, read: false, type: "message" },
      { $set: { read: true, readAt: new Date() } },
    );

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

    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: myObjectId }, { recipient: myObjectId }],
          deletedFor: { $ne: myObjectId },
        },
      },
      { $sort: { createdAt: -1 } },
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
                    { $eq: ["$unsent", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { "lastMessage.createdAt": -1 } },
      { $skip: offset },
      { $limit: limit },
    ]);

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

    const partnerIds = conversations.map((c) => c._id);
    const partners = await User.find({ _id: { $in: partnerIds } })
      .select("username firstName lastName avatar isDisabled");
    const partnerMap = new Map(partners.map((p) => [p._id.toString(), p]));

    const result = conversations
      .filter((c) => partnerMap.has(c._id.toString()))
      .map((c) => ({
        partner: partnerMap.get(c._id.toString()),
        lastMessage: decryptMessageContent(c.lastMessage),
        unread: c.unreadCount,
      }));

    res
      .status(200)
      .json(formatPaginatedResponse(result, total, page, limit));
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
        .json({ error: { message: "This message has reached its edit limit of 3.", code: "EDIT_LIMIT_REACHED" } });
    }

    const tenMinutes = 10 * 60 * 1000;
    const age = Date.now() - new Date(message.createdAt).getTime();
    if (age > tenMinutes) {
      return res
        .status(400)
        .json({ error: { message: "Messages can only be edited within 10 minutes of sending.", code: "EDIT_WINDOW_EXPIRED" } });
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
    emitToUser(message.recipient.toString(), "dm_message_unsent", { messageId });

    res.status(200).json({
      message: "Message unsent.",
      unsentMessage: decryptMessageContent(message),
    });
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
