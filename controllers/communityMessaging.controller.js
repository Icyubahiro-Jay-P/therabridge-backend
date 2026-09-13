import { Community } from "../models/chat.model.js";
import { CommunityMessage } from "../models/communityMessage.model.js";
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
  INITIAL_CATCHUP_WINDOW_MS,
} from "./chat.utils.js";
import {
  getCursorPaginationParams,
  formatCursorPaginatedResponse,
} from "../utils/pagination.js";

const populateCommunityMessages = (query) =>
  query.populate("sender", "username firstName lastName avatar");

const getLatestCommunityMessageTimestamp = async (communityId) => {
  const latest = await CommunityMessage.findOne({ community: communityId })
    .sort({ updatedAt: -1 })
    .select("updatedAt")
    .lean();
  return latest?.updatedAt;
};

const waitForCommunityUpdate = async (communityId, since) => {
  if (!since) return true;
  const sinceDate = new Date(since);
  if (Number.isNaN(sinceDate.getTime())) return true;

  const initialTimestamp = await getLatestCommunityMessageTimestamp(communityId);
  if (initialTimestamp && initialTimestamp > sinceDate) {
    return true;
  }

  const deadline = Date.now() + LONG_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, LONG_POLL_INTERVAL_MS));
    const updatedTimestamp = await getLatestCommunityMessageTimestamp(communityId);
    if (updatedTimestamp && updatedTimestamp > sinceDate) {
      return true;
    }
  }

  return false;
};

// Shared membership check every read/write endpoint below gates on.
const requireMembership = async (communityId, userId) => {
  const community = await Community.findById(communityId).select(
    "members moderators owner name inviteKey isDisabled",
  );
  if (!community) return { community: null, isMember: false };
  const isMember = community.members.some((m) => m.toString() === userId);
  return { community, isMember };
};

export const getCommunityMessages = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { community, isMember } = await requireMembership(communityId, req.user.id);
    if (!community || !isMember) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    const { cursor, limit } = getCursorPaginationParams(req.query, 100);

    let messages;
    let nextCursor = null;

    if (cursor) {
      const fetched = await populateCommunityMessages(
        CommunityMessage.find({ community: communityId, _id: { $lt: cursor } })
          .sort({ _id: -1 })
          .limit(limit + 1),
      );
      const hasMore = fetched.length > limit;
      if (hasMore) fetched.pop();
      nextCursor = hasMore ? fetched[fetched.length - 1]?._id : null;
      messages = fetched.reverse();
    } else {
      const fetched = await populateCommunityMessages(
        CommunityMessage.find({ community: communityId })
          .sort({ _id: -1 })
          .limit(limit),
      );
      messages = fetched.reverse();
      if (messages.length > 0) {
        const oldestId = messages[0]._id;
        const hasOlder = await CommunityMessage.exists({
          community: communityId,
          _id: { $lt: oldestId },
        });
        nextCursor = hasOlder ? oldestId : null;
      }
    }

    const lastUpdated = await getLatestCommunityMessageTimestamp(communityId);
    if (lastUpdated) {
      res.set("X-Last-Updated", lastUpdated.toISOString());
    }

    res.status(200).json(
      formatCursorPaginatedResponse(
        messages.map((m) => decryptCommunityMessageContent(m.toObject())),
        limit,
        nextCursor,
      ),
    );
  } catch (error) {
    throw error;
  }
};

export const getCommunityUpdates = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { since } = req.query;

    const { community, isMember } = await requireMembership(communityId, req.user.id);
    if (!community || !isMember) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    const lastUpdated = await getLatestCommunityMessageTimestamp(communityId);
    if (lastUpdated) {
      res.set("X-Last-Updated", lastUpdated.toISOString());
    }

    if (!since) {
      const sinceDate = new Date(Date.now() - INITIAL_CATCHUP_WINDOW_MS);
      const messages = await populateCommunityMessages(
        CommunityMessage.find({
          community: communityId,
          updatedAt: { $gt: sinceDate },
        }).sort({ createdAt: 1 }),
      );
      return res.status(200).json(messages.map((m) => decryptCommunityMessageContent(m.toObject())));
    }

    const hasUpdates = await waitForCommunityUpdate(communityId, since);
    if (!hasUpdates) {
      return res.status(204).end();
    }

    const sinceDate = new Date(since);
    if (Number.isNaN(sinceDate.getTime())) {
      return res.status(200).json([]);
    }

    const messages = await populateCommunityMessages(
      CommunityMessage.find({
        community: communityId,
        updatedAt: { $gt: sinceDate },
      }).sort({ createdAt: 1 }),
    );

    res.status(200).json(messages.map((m) => decryptCommunityMessageContent(m.toObject())));
  } catch (error) {
    throw error;
  }
};

export const sendCommunityMessage = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { content, replyToMessageId } = req.body;

    if (!content || content.trim() === "") {
      return res
        .status(400)
        .json({ error: { message: "Message content cannot be empty.", code: "BAD_REQUEST" } });
    }

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
      const original = await CommunityMessage.findOne({ _id: replyToMessageId, community: communityId });
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

    const message = new CommunityMessage({
      community: communityId,
      sender: req.user.id,
      content: encryptField(content.trim()),
      ...(replyToSnapshot && { replyTo: replyToSnapshot }),
    });

    const pointsEarned = await withTransaction(async (session) => {
      const opts = session ? { session } : undefined;
      await message.save(opts);
      // Community.updatedAt drives getMyCommunities' "most recently active
      // first" sort - bump it explicitly since messages are no longer
      // embedded subdocuments that would do this via community.save().
      await Community.updateOne(
        { _id: communityId },
        { $set: { updatedAt: new Date() } },
        opts,
      );
      return awardMessagePoints(req.user.id, MESSAGE_POINTS.community, session);
    });

    await message.populate("sender", "username firstName lastName avatar");
    const messageObj = decryptCommunityMessageContent(message.toObject());

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

    const message = await CommunityMessage.findOne({ _id: messageId, community: communityId });
    if (!message) {
      return res.status(404).json({ error: { message: "Message not found.", code: "NOT_FOUND" } });
    }

    if (message.sender.toString() !== myId) {
      return res
        .status(403)
        .json({ error: { message: "You can only edit your own messages.", code: "FORBIDDEN" } });
    }

    const community = await Community.findById(communityId).select("members");
    if (!community || !community.members.some((m) => m.toString() === myId)) {
      return res
        .status(403)
        .json({ error: { message: "You are no longer a member of this community.", code: "FORBIDDEN" } });
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

    const updatedObj = decryptCommunityMessageContent(message.toObject());
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

    const message = await CommunityMessage.findOne({ _id: messageId, community: communityId });
    if (!message) {
      return res.status(404).json({ error: { message: "Message not found.", code: "NOT_FOUND" } });
    }

    const community = await Community.findById(communityId).select("members moderators owner");
    if (!community) {
      return res.status(404).json({ error: { message: "Message not found.", code: "NOT_FOUND" } });
    }

    const isMember = community.members.some((m) => m.toString() === myId);
    const isSender = message.sender.toString() === myId;
    const isModerator = canModerate(community, myId, req.user.role);
    if ((!isSender || !isMember) && !isModerator) {
      return res
        .status(403)
        .json({ error: { message: "You can only unsend your own messages.", code: "FORBIDDEN" } });
    }

    message.unsent = true;
    message.content = encryptField("Message removed");
    await message.save();
    await message.populate("sender", "username firstName lastName avatar");

    const updatedObj = decryptCommunityMessageContent(message.toObject());
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

    const community = await Community.findById(communityId).select("members");
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

    await CommunityMessage.updateMany(
      { community: communityId },
      { $addToSet: { readBy: req.user.id } },
    );

    res.status(200).json({ message: "Messages marked as read." });
  } catch (error) {
    throw error;
  }
};

export const deleteAllMyCommunityMessages = async (req, res) => {
  try {
    const myId = req.user.id;

    const communities = await Community.find({ members: myId }).select("_id");
    const communityIds = communities.map((c) => c._id);

    const result = await CommunityMessage.deleteMany({
      community: { $in: communityIds },
      sender: myId,
    });

    res.status(200).json({
      message: `Deleted ${result.deletedCount} community messages.`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    throw error;
  }
};
