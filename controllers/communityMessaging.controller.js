import { Community } from "../models/chat.model.js";
import User from "../models/user.model.js";
import { emitToCommunity } from "../sockets/chatSocket.js";
import { awardMessagePoints, MESSAGE_POINTS } from "../utils/points.js";
import { withTransaction } from "../utils/transactions.js";
import { createNotification } from "../services/notification.service.js";
import { encryptField, decryptField } from "../utils/crypto.js";
import {
  decryptCommunityMessageContent,
  canModerate,
  LONG_POLL_INTERVAL_MS,
  LONG_POLL_TIMEOUT_MS,
} from "./chat.utils.js";

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

    let replyToSnapshot = undefined;
    if (replyToMessageId) {
      const original = community.messages.id(replyToMessageId);
      if (original && !original.unsent) {
        const origSender = await User.findById(original.sender).select("username avatar");
        replyToSnapshot = {
          _id: original._id,
          senderUsername: origSender?.username || "",
          senderAvatar: origSender?.avatar || null,
          content: encryptField(decryptField(original.content).slice(0, 150)),
          type: original.type || "text",
        };
      }
    }

    community.messages.push({
      sender: req.user.id,
      content: encryptField(content.trim()),
      ...(replyToSnapshot && { replyTo: replyToSnapshot }),
    });

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

    const sender = messageObj.sender || {};
    const senderName = sender.firstName || sender.username || "Someone";
    const memberIds = (community.members || [])
      .map((m) => m.toString())
      .filter((id) => id !== req.user.id);

    const plaintext = content.trim();
    await Promise.all(
      memberIds.map((memberId) =>
        createNotification(
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
          { skipIfOnline: true, pushOnly: true },
        ),
      ),
    );

    res.status(201).json({ ...messageObj, pointsEarned });
  } catch (error) {
    throw error;
  }
};

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

export const markCommunityMessagesRead = async (req, res) => {
  try {
    const { communityId } = req.params;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    await Community.updateOne(
      { _id: communityId },
      { $addToSet: { "messages.$[].readBy": req.user.id } },
    );

    res.status(200).json({ message: "Messages marked as read." });
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
