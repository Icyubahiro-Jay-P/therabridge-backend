import Notification from "../models/notification.model.js";
import {
  getPaginationParams,
  formatPaginatedResponse,
} from "../utils/pagination.js";

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

    res.status(200).json(formatPaginatedResponse(notifications, total, page, limit));
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user.id, read: false });
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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
    res.status(200).json(notification);
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    res.status(200).json({ message: "All notifications marked as read." });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
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
    res.status(200).json({ message: "Notification deleted." });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

export const deleteAllNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({ recipient: req.user.id });
    res.status(200).json({ message: "All notifications deleted." });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

export { createNotification } from "../services/notification.service.js";
