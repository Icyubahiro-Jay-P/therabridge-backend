import Notification from "../models/notification.model.js";
import { decryptField } from "../utils/crypto.js";
import { emitToUser } from "../sockets/chatSocket.js";
import {
  getPaginationParams,
  formatPaginatedResponse,
} from "../utils/pagination.js";
import { getUnreadCount, setUnreadCount, invalidateUnreadCount } from "../services/cache.js";

export const getMyNotifications = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query, 100);

    const filter = { recipient: req.user.id };
    const total = await Notification.countDocuments(filter);
    const notifications = await Notification.find(filter)
      .sort("-createdAt")
      .populate("sender", "username firstName lastName avatar")
      .skip(offset)
      .limit(limit);

    const payload = notifications.map((n) => {
      const obj = n.toObject();
      obj.body = decryptField(obj.body);
      return obj;
    });

    res.status(200).json(formatPaginatedResponse(payload, total, page, limit));
  } catch (error) {
    throw error;
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user.id, read: false });
    res.status(200).json({ count });
  } catch (error) {
    throw error;
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: req.user.id },
      { $set: { read: true, readAt: new Date() } },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ error: { message: "Notification not found.", code: "NOT_FOUND" } });
    }
    const obj = notification.toObject();
    obj.body = decryptField(obj.body);

    const unread = await Notification.countDocuments({
      recipient: req.user.id,
      read: false,
    });
    emitToUser(req.user.id, "notifications_updated", { count: unread });

    res.status(200).json(obj);
  } catch (error) {
    throw error;
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    const unread = await Notification.countDocuments({
      recipient: req.user.id,
      read: false,
    });
    emitToUser(req.user.id, "notifications_updated", { count: unread });
    res.status(200).json({ message: "All notifications marked as read." });
  } catch (error) {
    throw error;
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndDelete({
      _id: id,
      recipient: req.user.id,
    });
    if (!notification) {
      return res.status(404).json({ error: { message: "Notification not found.", code: "NOT_FOUND" } });
    }

    const unread = await Notification.countDocuments({
      recipient: req.user.id,
      read: false,
    });
    emitToUser(req.user.id, "notifications_updated", { count: unread });

    res.status(200).json({ message: "Notification deleted." });
  } catch (error) {
    throw error;
  }
};

export const deleteAllNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({ recipient: req.user.id });
    const unread = await Notification.countDocuments({
      recipient: req.user.id,
      read: false,
    });
    emitToUser(req.user.id, "notifications_updated", { count: unread });
    res.status(200).json({ message: "All notifications deleted." });
  } catch (error) {
    throw error;
  }
};

export { createNotification } from "../services/notification.service.js";
