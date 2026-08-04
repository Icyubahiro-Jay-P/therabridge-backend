import webpush from "web-push";
import PushSubscription from "../models/pushSubscription.model.js";
import logger from "../utils/logger.js";
import { hasActiveConnection } from "../sockets/chatSocket.js";

const DEFAULT_TTL_SECONDS = 60 * 60;

const isVapidConfigured = () =>
  !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;

const ensureVapid = () => {
  if (!isVapidConfigured()) {
    throw new Error(
      "VAPID keys are not configured. Run `npm run vapid` and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.",
    );
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:no-reply@therabridge.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
};

export const getVapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || "";

export const savePushSubscription = async (userId, subscription, userAgent = "") => {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error("Invalid push subscription");
  }

  const saved = await PushSubscription.findOneAndUpdate(
    { user: userId, endpoint: subscription.endpoint },
    {
      $set: {
        "keys.p256dh": subscription.keys.p256dh,
        "keys.auth": subscription.keys.auth,
        userAgent: userAgent || "",
        lastUsedAt: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return saved;
};

export const deletePushSubscription = async (userId, endpoint) => {
  if (!endpoint) return null;
  return PushSubscription.findOneAndDelete({ user: userId, endpoint });
};

export const deleteAllPushSubscriptions = async (userId) => {
  return PushSubscription.deleteMany({ user: userId });
};

// Sends a device push to every subscription the user has. If `skipIfOnline`
// is true (used for chat messages), no push is sent while the user has a live
// socket — they already get the in-app notification in real time.
export const sendPushToUser = async (userId, { title, body, data = {} }, { skipIfOnline = false } = {}) => {
  try {
    if (skipIfOnline && hasActiveConnection(userId)) return 0;

    const subscriptions = await PushSubscription.find({ user: userId });
    if (subscriptions.length === 0) return 0;

    let payload;
    try {
      ensureVapid();
      payload = JSON.stringify({ title, body, data });
    } catch (err) {
      logger.warn({ err }, "Push skipped: VAPID not configured");
      return 0;
    }

    let sent = 0;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          },
          payload,
          { TTL: DEFAULT_TTL_SECONDS },
        );
        sub.lastUsedAt = new Date();
        await sub.save();
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Subscription is gone/stale — clean it up.
          await sub.deleteOne();
          logger.info("Removed stale push subscription");
        } else {
          logger.error({ err, statusCode: err.statusCode }, "Push delivery failed");
        }
      }
    }
    return sent;
  } catch (error) {
    logger.error({ err: error }, "Failed to send push notification");
    return 0;
  }
};
