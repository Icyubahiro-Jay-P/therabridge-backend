import { Community } from "../models/chat.model.js";
import User from "../models/user.model.js";
import crypto from "crypto";
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
      // Joining twice is an idempotent no-op - return the community so the
      // client can simply navigate into it.
      await community.populate("owner", "username firstName lastName avatar");
      await community.populate("members", "username firstName lastName avatar");
      await community.populate("moderators", "username firstName lastName avatar");
      return res
        .status(200)
        .json({ message: "You're already a member of this community.", community, alreadyMember: true });
    }

    if (community.isPrivate) {
      const alreadyPending = community.pendingMembers.some(
        (m) => m.toString() === req.user.id,
      );
      if (alreadyPending) {
        return res
          .status(202)
          .json({ message: "Your join request is already pending approval.", pending: true });
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

    if (!canModerate(community, req.user.id, req.user.role)) {
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

    community.members = community.members.filter((m) => m.toString() !== userId);
    community.moderators = (community.moderators ?? []).filter((m) => m.toString() !== userId);
    community.pendingMembers = (community.pendingMembers ?? []).filter((m) => m.toString() !== userId);

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

    if (req.user.role === "therapist") {
      const managesUser = target.therapist?.toString() === req.user.id;
      if (!managesUser) {
        return res.status(403).json({
          error: { message: "Therapists can only invite users they manage.", code: "FORBIDDEN" },
        });
      }
    }

    if (community.members.some((m) => m.toString() === userId)) {
      // The person is already in - the goal state is reached, so report
      // success instead of an error.
      return res.status(200).json({ message: "This user is already a member.", alreadyMember: true });
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
      return res.status(200).json({ message: "This user is already a moderator.", alreadyModerator: true });
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
