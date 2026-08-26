import { Message } from "../models/chat.model.js";
import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";
import { emitToUser } from "../sockets/chatSocket.js";
import {
  getPaginationParams,
  formatPaginatedResponse,
  getCursorPaginationParams,
  formatCursorPaginatedResponse,
} from "../utils/pagination.js";
import { decryptMessageContent, LONG_POLL_INTERVAL_MS, LONG_POLL_TIMEOUT_MS, INITIAL_CATCHUP_WINDOW_MS } from "./chat.utils.js";

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
