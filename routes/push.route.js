import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { jsonBody } from "../middleware/jsonBody.js";
import {
  getVapidPublicKey,
  savePushSubscription,
  deletePushSubscription,
} from "../services/push.service.js";

const router = express.Router();

router.use(jsonBody("10kb"));

// Public VAPID key the client needs to create a push subscription.
router.get("/vapid-public-key", authMiddleware, (req, res) => {
  res.status(200).json({ publicKey: getVapidPublicKey() });
});

// Register (or refresh) this device's push subscription.
router.post("/subscribe", authMiddleware, async (req, res) => {
  try {
    const { subscription, userAgent } = req.body;
    if (
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth
    ) {
      return res
        .status(400)
        .json({ error: { message: "Invalid push subscription.", code: "BAD_REQUEST" } });
    }
    const saved = await savePushSubscription(
      req.user.id,
      subscription,
      typeof userAgent === "string" ? userAgent : "",
    );
    res.status(201).json({ success: true, subscription: saved });
  } catch (error) {
    throw error;
  }
});

// Remove a single device subscription (called on logout/unsubscribe).
router.post("/unsubscribe", authMiddleware, async (req, res) => {
  try {
    const { endpoint } = req.body;
    await deletePushSubscription(req.user.id, endpoint);
    res.status(200).json({ success: true });
  } catch (error) {
    throw error;
  }
});

export default router;
