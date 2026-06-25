import Notification from "../models/notification.model.js";

export const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user.id })
      .sort("-createdAt")
      .populate("sender", "username firstName lastName avatar")
      .limit(100);
    res.status(200).json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user.id, read: false });
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      return res.status(404).json({ message: "Notification not found." });
    }
    res.status(200).json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
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
      return res.status(404).json({ message: "Notification not found." });
    }
    res.status(200).json({ message: "Notification deleted." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteAllNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({ recipient: req.user.id });
    res.status(200).json({ message: "All notifications deleted." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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
  }
};
