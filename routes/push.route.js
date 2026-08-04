import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  getVapidPublicKey,
  savePushSubscription,
  deletePushSubscription,
} from "../services/push.service.js";

const router = express.Router();

// Public VAPID key the client needs to create a push subscription.
router.get("/vapid-public-key", authMiddleware, (req, res) => {
  res.status(200).json({ publicKey: getVapidPublicKey() });
});

// Register (or refresh) this device's push subscription.
router.post("/subscribe", authMiddleware, async (req, res) => {
  try {
    const { subscription, userAgent } = req.body;
    if (!subscription?.endpoint) {
      return res
        .status(400)
        .json({ error: { message: "Missing push subscription.", code: "BAD_REQUEST" } });
    }
    const saved = await savePushSubscription(
      req.user.id,
      subscription,
      typeof userAgent === "string" ? userAgent : "",
    );
    res.status(201).json({ success: true, subscription: saved });
  } catch (error) {
    res
      .status(400)
      .json({ error: { message: error.message, code: "BAD_REQUEST" } });
  }
});

// Remove a single device subscription (called on logout/unsubscribe).
router.post("/unsubscribe", authMiddleware, async (req, res) => {
  try {
    const { endpoint } = req.body;
    await deletePushSubscription(req.user.id, endpoint);
    res.status(200).json({ success: true });
  } catch (error) {
    res
      .status(500)
      .json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
});

export default router;
