import Notification from "../models/notification.model.js";
import { encryptField, encryptionEnabled, decryptField } from "../utils/crypto.js";
import { emitToUser } from "../sockets/chatSocket.js";
import { sendPushToUser } from "./push.service.js";
import logger from "../utils/logger.js";

// Where a device-notification tap should land, by notification type.
const DEFAULT_URLS = {
  message: "/chat",
  community_invite: "/community",
  exercise_reminder: "/exercises",
  mood_reminder: "/mood",
  crisis_alert: "/crisis",
  community_update: "/community",
  streak_milestone: "/",
  system: "/notifications",
};

export const createNotification = async (
  recipientId,
  type,
  title,
  body,
  data = {},
  senderId = null,
  { skipIfOnline = false } = {},
) => {
  try {
    // Bodies carry message previews, so they are encrypted at rest but always
    // delivered to clients/push in plaintext.
    const storedBody = encryptionEnabled() ? encryptField(body ?? "") : body;
    const notification = new Notification({
      recipient: recipientId,
      sender: senderId,
      type,
      title,
      body: storedBody,
      data,
    });
    await notification.save();
    emitToUser(recipientId, "notification", {
      ...notification.toObject(),
      body: decryptField(notification.body),
    });

    // Deliver the same notification to the device via Web Push.
    await sendPushToUser(
      recipientId,
      {
        title,
        body,
        data: {
          ...data,
          url: data.url || DEFAULT_URLS[type] || "/notifications",
          type,
          notificationId: notification._id.toString(),
        },
      },
      { skipIfOnline },
    );

    return notification;
  } catch (error) {
    logger.error({ err: error }, "Failed to create notification");
    return null;
  }
};
