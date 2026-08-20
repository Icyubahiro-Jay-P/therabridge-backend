import User from "../models/user.model.js";
import { deleteUserAndData } from "../services/deletion.service.js";
import { logAccess, ipFromReq, uaFromReq } from "../services/audit.service.js";

// ====================== ADMIN & THERAPIST FEATURES ======================

export const disableUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (user.role === "admin") {
      return res.status(400).json({ message: "Cannot disable another admin." });
    }
    user.isDisabled = !user.isDisabled;
    await user.save();
    res.status(200).json({
      message: `User ${user.isDisabled ? "disabled" : "enabled"} successfully.`,
      user: {
        _id: user._id,
        isDisabled: user.isDisabled,
        username: user.username,
      },
    });
  } catch (error) {
    throw error;
  }
};

export const changeUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!["user", "therapist", "admin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role." });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    user.role = role;
    await user.save();
    res.status(200).json({
      message: `User role updated to ${role}.`,
      user: { _id: user._id, username: user.username, role: user.role },
    });
  } catch (error) {
    throw error;
  }
};

export const deleteUserByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (user.role === "admin") {
      return res.status(400).json({ message: "Cannot delete another admin." });
    }

    await deleteUserAndData(id);
    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: "account_deletion",
      targetType: "user",
      target: id,
      detail: { selfService: false },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });
    res.status(200).json({ message: "User deleted by admin." });
  } catch (error) {
    throw error;
  }
};

export const getFullUserData = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    const user = await User.findById(id).select(
      "-password -oldPasswords -resetPasswordToken -resetPasswordExpire -refreshTokens -verificationCode -verificationCodeExpire",
    );
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (currentUser.role === "therapist") {
      if (user.role === "therapist" || user.role === "admin") {
        return res
          .status(403)
          .json({ message: "Therapists can only view user profiles." });
      }
      if (!user.therapist || user.therapist.toString() !== currentUser.id) {
        return res
          .status(403)
          .json({ message: "You can only view profiles of your assigned clients." });
      }
    }
    await logAccess({
      actor: currentUser.id,
      actorRole: currentUser.role,
      action: "user_profile_view",
      targetType: "user",
      target: id,
      detail: { scope: "full" },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });
    res.status(200).json(user);
  } catch (error) {
    throw error;
  }
};
