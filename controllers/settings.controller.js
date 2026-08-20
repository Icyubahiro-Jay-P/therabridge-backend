import User from "../models/user.model.js";

export const getChatSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("chatSettings");
    res.status(200).json(user.chatSettings);
  } catch (error) {
    throw error;
  }
};

export const updateChatSettings = async (req, res) => {
  try {
    const { chatSettings } = req.body;

    const allowedFields = ["readReceipts"];
    const updates = {};
    for (const field of allowedFields) {
      if (chatSettings[field] !== undefined) {
        if (typeof chatSettings[field] !== "boolean") {
          return res
            .status(400)
            .json({ error: { message: `${field} must be a boolean.`, code: "VALIDATION_ERROR" } });
        }
        updates[`chatSettings.${field}`] = chatSettings[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: { message: "No valid settings provided.", code: "VALIDATION_ERROR" } });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true },
    ).select("chatSettings");

    res.status(200).json({
      message: "Chat settings updated",
      chatSettings: user.chatSettings,
    });
  } catch (error) {
    throw error;
  }
};
