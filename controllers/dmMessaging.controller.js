import { Message } from "../models/chat.model.js";
import User from "../models/user.model.js";
import { emitToUser } from "../sockets/chatSocket.js";
import { awardMessagePoints, MESSAGE_POINTS } from "../utils/points.js";
import { withTransaction } from "../utils/transactions.js";
import { createNotification } from "../services/notification.service.js";
import { encryptField, decryptField } from "../utils/crypto.js";
import { decryptMessageContent } from "./chat.utils.js";

const populateConversationMessages = (query) =>
  query
    .populate("sender", "username firstName lastName avatar")
    .populate("recipient", "username firstName lastName avatar");

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
          content: encryptField(decryptField(origObj.content).slice(0, 150)),
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
