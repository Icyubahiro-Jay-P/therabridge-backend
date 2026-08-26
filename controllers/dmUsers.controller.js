import { Message } from "../models/chat.model.js";
import User from "../models/user.model.js";

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
