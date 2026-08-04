import Notification from "../models/notification.model.js";
import { emitToUser } from "../sockets/chatSocket.js";
import logger from "../utils/logger.js";

export const createNotification = async (recipientId, type, title, body, data = {}, senderId = null) => {
  try {
    const notification = new Notification({
      recipient: recipientId,
      sender: senderId,
      type,
      title,
      body,
      data,
    });
    await notification.save();
    emitToUser(recipientId, "notification", notification.toObject());
    return notification;
  } catch (error) {
    logger.error({ err: error }, "Failed to create notification");
    return null;
  }
};
