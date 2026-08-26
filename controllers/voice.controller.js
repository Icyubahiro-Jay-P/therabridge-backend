import { Message, Community } from "../models/chat.model.js";
import User from "../models/user.model.js";
import { emitToUser, emitToCommunity } from "../sockets/chatSocket.js";
import { awardMessagePoints, MESSAGE_POINTS } from "../utils/points.js";
import { withTransaction } from "../utils/transactions.js";
import { createNotification } from "../services/notification.service.js";
import { encryptField, decryptField } from "../utils/crypto.js";
import { uploadAudioToCloudinary } from "../utils/cloudinary.js";
import {
  decryptMessageContent,
  decryptCommunityMessageContent,
} from "./chat.utils.js";

export const sendVoiceMessage = async (req, res) => {
  try {
    const { recipientId, duration, replyToMessageId } = req.body;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: { message: "No audio file uploaded.", code: "BAD_REQUEST" } });
    }

    if (recipientId === req.user.id) {
      return res.status(400).json({ error: { message: "Cannot send message to yourself.", code: "BAD_REQUEST" } });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ error: { message: "Recipient not found.", code: "NOT_FOUND" } });
    }
    if (recipient.isDisabled) {
      return res.status(403).json({ error: { message: "This user has been disabled.", code: "USER_DISABLED" } });
    }

    const result = await uploadAudioToCloudinary(req.file.buffer, req.user.id, req.file.mimetype);

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
          content: encryptField(decryptField(origObj.content).slice(0, 150)),
          type: origObj.type || "text",
        };
      }
    }

    const message = new Message({
      sender: req.user.id,
      recipient: recipientId,
      type: "voice",
      content: encryptField(""),
      audioUrl: result.secure_url,
      duration: Number(duration) || 0,
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
    await createNotification(
      recipientId,
      "message",
      sender.firstName || sender.username || "New message",
      "Voice message",
      { url: sender.username ? `/chat/${sender.username}` : "/chat" },
      req.user.id,
      { skipIfOnline: true, pushOnly: true },
    );

    res.status(201).json({ ...messageObj, pointsEarned });
  } catch (error) {
    throw error;
  }
};

export const sendCommunityVoiceMessage = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { duration, replyToMessageId } = req.body;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: { message: "No audio file uploaded.", code: "BAD_REQUEST" } });
    }

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }
    if (!community.members.some((m) => m.toString() === req.user.id)) {
      return res.status(403).json({ error: { message: "You are not a member of this community.", code: "FORBIDDEN" } });
    }
    if (community.isDisabled) {
      return res.status(403).json({ error: { message: "This community has been disabled.", code: "COMMUNITY_DISABLED" } });
    }

    const result = await uploadAudioToCloudinary(req.file.buffer, req.user.id, req.file.mimetype);

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
      type: "voice",
      content: encryptField(""),
      audioUrl: result.secure_url,
      duration: Number(duration) || 0,
      ...(replyToSnapshot && { replyTo: replyToSnapshot }),
    });

    const pointsEarned = await withTransaction(async (session) => {
      await community.save(session ? { session } : undefined);
      return awardMessagePoints(req.user.id, MESSAGE_POINTS.community, session);
    });

    const updatedCommunity = await Community.findById(communityId).populate(
      "messages.sender", "username firstName lastName avatar",
    );
    const newMessage = updatedCommunity.messages[updatedCommunity.messages.length - 1];
    const messageObj = decryptCommunityMessageContent(newMessage.toObject());

    emitToCommunity(communityId, "community_message", { communityId, message: messageObj });

    const sender = messageObj.sender || {};
    const senderName = sender.firstName || sender.username || "Someone";
    const memberIds = (community.members || [])
      .map((m) => m.toString())
      .filter((id) => id !== req.user.id);

    for (const memberId of memberIds) {
      await createNotification(
        memberId,
        "community_update",
        `${senderName} · ${community.name}`,
        "Voice message",
        { url: community.inviteKey ? `/community/${community.inviteKey}` : "/community" },
        req.user.id,
        { skipIfOnline: true },
      );
    }

    res.status(201).json({ ...messageObj, pointsEarned });
  } catch (error) {
    throw error;
  }
};
