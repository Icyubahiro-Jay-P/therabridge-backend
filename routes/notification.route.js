import express from "express";
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
} from "../controllers/notification.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { jsonBody } from "../middleware/jsonBody.js";

const router = express.Router();

router.use(jsonBody("10kb"));
router.use(authMiddleware);

router.get("/", getMyNotifications);
router.get("/unread-count", getUnreadCount);
router.put("/:id/read", markAsRead);
router.put("/read-all", markAllAsRead);
router.delete("/:id", deleteNotification);
router.delete("/", deleteAllNotifications);

export default router;
