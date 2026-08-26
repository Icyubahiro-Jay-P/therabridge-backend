import Notification from "../models/notification.model.js";
import { encryptField, encryptionEnabled, decryptField } from "../utils/crypto.js";
import { emitToUser } from "../sockets/chatSocket.js";
import { sendPushToUser } from "./push.service.js";
import { invalidateUnreadCount } from "./cache.js";
import { notificationQueue } from "./queue.js";
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
  mood_checkin: "/chat/therry",
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
    await invalidateUnreadCount(recipientId);
    emitToUser(recipientId, "notification", {
      ...notification.toObject(),
      body: decryptField(notification.body),
    });

    // Queue push delivery (non-critical path — won't block the request)
    const criticalTypes = ["crisis_alert", "message"];
    const isCritical = criticalTypes.includes(type);

    const pushPayload = {
      title,
      body,
      data: {
        ...data,
        url: data.url || DEFAULT_URLS[type] || "/notifications",
        type,
        notificationId: notification._id.toString(),
      },
    };

    if (isCritical) {
      // Critical notifications: deliver inline for reliability
      await sendPushToUser(recipientId, pushPayload, { skipIfOnline });
    } else {
      // Non-critical: queue for async delivery with retry
      await notificationQueue.add(
        "send-push",
        { recipientId, payload: pushPayload, skipIfOnline },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: true,
          removeOnFail: { count: 50 },
        },
      );
    }

    return notification;
  } catch (error) {
    const criticalTypes = ["crisis_alert", "message"];
    if (criticalTypes.includes(type)) {
      throw error;
    }
    logger.error({ err: error }, "Failed to create notification");
    return null;
  }
};

// Worker processor for notification push queue
export const processNotificationJob = async (job) => {
  const { recipientId, payload, skipIfOnline } = job.data;
  await sendPushToUser(recipientId, payload, { skipIfOnline });
};
