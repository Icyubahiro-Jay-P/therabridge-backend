import Notification from "../models/notification.model.js";

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
    return notification;
  } catch (error) {
    console.error("Failed to create notification:", error.message);
    return null;
  }
};
