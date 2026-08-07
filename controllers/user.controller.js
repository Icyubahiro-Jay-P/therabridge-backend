import User from "../models/user.model.js";
import { Message, Community } from "../models/chat.model.js";
import Mood from "../models/mood.model.js";
import Crisis from "../models/crisis.model.js";
import { TherryMessage } from "../models/therryMessage.model.js";
import Notification from "../models/notification.model.js";
import ExerciseLog from "../models/exerciseLog.model.js";
import PushSubscription from "../models/pushSubscription.model.js";
import SafetyPlan from "../models/safetyPlan.model.js";
import { deleteUserAndData } from "../services/deletion.service.js";
import { decryptField } from "../utils/crypto.js";
import { logAccess, ipFromReq, uaFromReq } from "../services/audit.service.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import sendEmail from "../utils/nodemailer.js";
import getClientOrigin from "../utils/clientOrigin.js";
import logger from "../utils/logger.js";
import {
  signAccessToken,
  createRefreshToken,
  hashRefreshToken,
  setAuthCookies,
  clearAuthCookies,
} from "../utils/tokens.js";
import {
  getPaginationParams,
  formatPaginatedResponse,
  parseSortParams,
  parseFilterParams,
} from "../utils/pagination.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const updateLoginStreak = async (user) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastLogin = user.lastLoginDate ? new Date(user.lastLoginDate) : null;

  if (lastLogin) {
    lastLogin.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - lastLogin) / 86400000);
    if (diffDays === 0) return;
    if (diffDays === 1) {
      user.loginStreak = (user.loginStreak || 0) + 1;
    } else {
      user.loginStreak = 1;
    }
  } else {
    user.loginStreak = 1;
  }

  user.lastLoginDate = today;
  if (user.loginStreak > (user.longestLoginStreak || 0)) {
    user.longestLoginStreak = user.loginStreak;
  }
  await user.save();
};

export const register = async (req, res) => {
  try {
    const { username, email, password, firstName, lastName, dateOfBirth } =
      req.body;

    // === Validations ===
    if (
      !username ||
      !email ||
      !password ||
      !firstName ||
      !lastName ||
      !dateOfBirth
    ) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Password length
    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long." });
    }

    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    // Age check
    if (age < 18 || age > 120) {
      return res
        .status(400)
        .json({ message: "Invalid age. Must be between 18 and 120." });
    }

    // Email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format." });
    }

    // Username format
    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        message:
          "Invalid username. Use letters, numbers, underscores only (3-30 chars).",
      });
    }

    // Names length
    if (firstName.length < 2 || lastName.length < 2) {
      return res.status(400).json({
        message: "First and last name must be at least 2 characters long.",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      if (existingUser.email === email) {
        return res
          .status(400)
          .json({ message: "Email is already registered." });
      }
      return res.status(400).json({ message: "Username is already taken." });
    }

    // Hash & create user
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      dateOfBirth,
    });

    await user.save();

    // Auto-login after register - short-lived access token + rotating refresh token
    const accessToken = signAccessToken(user);
    const { token: refreshToken, jti } = createRefreshToken(user);
    user.refreshTokens.push(hashRefreshToken(jti));
    await user.save();
    setAuthCookies(res, { accessToken, refreshToken });

    await updateLoginStreak(user);

    res.status(201).json({
      message: "User registered successfully",
      token: accessToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        privacySettings: user.privacySettings,
        exerciseScore: user.exerciseScore,
        loginStreak: user.loginStreak,
        exerciseStreak: user.exerciseStreak,
        longestLoginStreak: user.longestLoginStreak,
        longestExerciseStreak: user.longestExerciseStreak,
      },
    });
  } catch (error) {
    throw error;
  }
};

export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res
        .status(400)
        .json({ error: { message: "Email/username and password are required.", code: "VALIDATION_ERROR" } });
    }

    // Find user by email or username
    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    });
    if (!user) {
      return res.status(401).json({ error: { message: "Invalid credentials.", code: "AUTH_ERROR" } });
    }
    // verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: { message: "Invalid credentials.", code: "AUTH_ERROR" } });
    }

    if (user.isDisabled) {
      return res
        .status(403)
        .json({ error: { message: "Your account has been disabled. Please contact support.", code: "ACCOUNT_DISABLED" } });
    }

    // Issue a short-lived access token + rotating refresh token
    const accessToken = signAccessToken(user);
    const { token: refreshToken, jti } = createRefreshToken(user);
    user.refreshTokens.push(hashRefreshToken(jti));
    await user.save();
    setAuthCookies(res, { accessToken, refreshToken });

    await updateLoginStreak(user);

    res.status(200).json({
      message: "Login successful",
      token: accessToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        privacySettings: user.privacySettings,
        exerciseScore: user.exerciseScore,
        loginStreak: user.loginStreak,
        exerciseStreak: user.exerciseStreak,
        longestLoginStreak: user.longestLoginStreak,
        longestExerciseStreak: user.longestExerciseStreak,
      },
    });
  } catch (error) {
    throw error;
  }
};

export const logout = async (req, res) => {
  try {
    // Best-effort refresh-token revocation so the session can't be resumed
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
      if (decoded?.type === "refresh" && decoded?.jti) {
        await User.updateOne(
          { _id: decoded.id },
          { $pull: { refreshTokens: hashRefreshToken(decoded.jti) } },
        );
      }
    }
  } catch {
    // Ignore invalid/expired refresh tokens - just clear the cookies
  }
  clearAuthCookies(res);
  res.status(200).json({ message: "Logout successful" });
};

export const refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res
        .status(401)
        .json({ message: "Session expired. Please log in again." });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    if (decoded?.type !== "refresh" || !decoded?.jti) {
      return res.status(401).json({ message: "Invalid refresh token." });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res
        .status(401)
        .json({ message: "User account no longer exists." });
    }
    if (user.isDisabled) {
      return res
        .status(403)
        .json({ message: "Account has been disabled. Contact support." });
    }

    // Reject unknown/revoked refresh tokens, then rotate to a fresh one
    const tokenHash = hashRefreshToken(decoded.jti);
    if (!(user.refreshTokens || []).includes(tokenHash)) {
      return res.status(401).json({ message: "Invalid refresh token." });
    }

    user.refreshTokens = user.refreshTokens.filter((t) => t !== tokenHash);
    const { token: newRefreshToken, jti } = createRefreshToken(user);
    user.refreshTokens.push(hashRefreshToken(jti));
    await user.save();

    const accessToken = signAccessToken(user);
    setAuthCookies(res, {
      accessToken,
      refreshToken: newRefreshToken,
    });

    res.status(200).json({ token: accessToken });
  } catch (error) {
    clearAuthCookies(res);
    res.status(401).json({ message: "Invalid or expired refresh token." });
  }
};

export const profile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "-password -oldPasswords -refreshTokens",
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    throw error;
  }
};

// get other user profile by username (privacy-filtered)
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select(
      "-password -oldPasswords -resetPasswordToken -resetPasswordExpire -refreshTokens",
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // If requesting own profile, return everything
    if (req.user && user._id.toString() === req.user.id) {
      return res.status(200).json(user);
    }

    // Filter based on privacy settings
    const privacy = user.privacySettings || {};
    const filtered = user.toObject();

    for (const field of [
      "firstName",
      "lastName",
      "email",
      "dateOfBirth",
      "bio",
    ]) {
      if (privacy[field] === "private") {
        filtered[field] = null;
      }
    }

    // Always include these regardless
    filtered.username = user.username;
    filtered.role = user.role;
    filtered.avatar = user.avatar;
    filtered._id = user._id;
    filtered.createdAt = user.createdAt;
    filtered.privacySettings = undefined;

    res.status(200).json(filtered);
  } catch (error) {
    throw error;
  }
};

// get user by ID (admin / chat lookup)
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "-password -oldPasswords -refreshTokens",
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // If requesting own profile, return everything
    if (req.user && user._id.toString() === req.user.id) {
      return res.status(200).json(user);
    }

    // Filter based on privacy settings
    const privacy = user.privacySettings || {};
    const filtered = user.toObject();

    for (const field of [
      "firstName",
      "lastName",
      "email",
      "dateOfBirth",
      "bio",
    ]) {
      if (privacy[field] === "private") {
        filtered[field] = null;
      }
    }

    filtered.username = user.username;
    filtered.role = user.role;
    filtered.avatar = user.avatar;
    filtered._id = user._id;
    filtered.createdAt = user.createdAt;
    filtered.privacySettings = undefined;

    // Only privileged roles viewing another user are audited (normal public
    // profile browsing is not a privacy-sensitive event).
    if (
      req.user.role !== "user" &&
      user._id.toString() !== req.user.id
    ) {
      await logAccess({
        actor: req.user.id,
        actorRole: req.user.role,
        action: "user_profile_view",
        targetType: "user",
        target: user._id,
        detail: { scope: "filtered" },
        ip: ipFromReq(req),
        userAgent: uaFromReq(req),
      });
    }

    res.status(200).json(filtered);
  } catch (error) {
    throw error;
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, dateOfBirth, bio, avatar } = req.body;

    const updates = {};

    if (firstName) {
      if (firstName.length < 2) {
        return res
          .status(400)
          .json({ message: "First name must be at least 2 characters long." });
      }
      updates.firstName = firstName;
    }

    if (lastName) {
      if (lastName.length < 2) {
        return res
          .status(400)
          .json({ message: "Last name must be at least 2 characters long." });
      }
      updates.lastName = lastName;
    }

    if (dateOfBirth) {
      const today = new Date();
      const birthDate = new Date(dateOfBirth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        age--;
      }
      if (age < 18 || age > 120) {
        return res
          .status(400)
          .json({ message: "Invalid age. Must be between 18 and 120." });
      }
      updates.dateOfBirth = dateOfBirth;
    }

    if (bio !== undefined) updates.bio = bio;
    if (avatar !== undefined) updates.avatar = avatar;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true },
    ).select(
      "-password -oldPasswords -resetPasswordToken -resetPasswordExpire -refreshTokens",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    throw error;
  }
};

export const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: "User not found" });
    }

    // Optimize the uploaded avatar using Sharp
    const uploadDir = path.dirname(req.file.path);
    const optimizedFilename = `${path.parse(req.file.filename).name}.webp`;
    const optimizedPath = path.join(uploadDir, optimizedFilename);

    try {
      await sharp(req.file.path, { failOn: "none" })
        .rotate()
        .resize({
          width: 1200,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80, effort: 6 })
        .toFile(optimizedPath);

      // Replace original uploaded file with optimized file
      fs.unlinkSync(req.file.path);
      req.file.path = optimizedPath;
      req.file.filename = optimizedFilename;
    } catch {
      // Sharp's decoder (libspng) is stricter than browsers and rejects some
      // images (e.g. slightly malformed PNGs). If it can't optimize the file,
      // keep the original upload - the browser already validated it renders.
    }

    // Delete previous avatar if it was an uploaded file
    if (user.avatar && user.avatar.startsWith("/uploads/")) {
      const resolvedPath = path.resolve(
        path.join(__dirname, "..", user.avatar),
      );
      const uploadsDir = path.resolve(path.join(__dirname, "..", "uploads"));
      if (resolvedPath.startsWith(uploadsDir) && fs.existsSync(resolvedPath)) {
        fs.unlinkSync(resolvedPath);
      }
    }

    const avatarPath = "/uploads/" + req.file.filename;
    user.avatar = avatarPath;
    await user.save();

    res.status(200).json({
      message: "Profile picture uploaded successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        privacySettings: user.privacySettings,
      },
    });
  } catch (error) {
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
    throw error;
  }
};

export const deleteProfile = async (req, res) => {
  try {
    // prompt a user to confirm deletion by rewriting their username in the request body
    const { username } = req.body;
    const currentUser = await User.findById(req.user.id);

    if (username !== currentUser.username) {
      return res.status(400).json({
        message: "Username does not match. Please confirm deletion.",
      });
    } else {
      await deleteUserAndData(req.user.id);
      await logAccess({
        actor: req.user.id,
        actorRole: req.user.role,
        action: "account_deletion",
        targetType: "user",
        target: req.user.id,
        detail: { selfService: true },
        ip: ipFromReq(req),
        userAgent: uaFromReq(req),
      });
      clearAuthCookies(res);
      res.status(200).json({ message: "User deleted successfully" });
    }
  } catch (error) {
    throw error;
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    // Check if current password is correct
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid current password" });
    }

    // Ensure new password isn't equal to current hashed password or any previously used hashed passwords
    const isSameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (isSameAsCurrent) {
      return res.status(400).json({
        message: "New password cannot be the same as the current password",
      });
    }

    for (const oldHash of user.oldPasswords || []) {
      // compare new plaintext password with previously stored hashed passwords
      // eslint-disable-next-line no-await-in-loop
      const isOld = await bcrypt.compare(newPassword, oldHash);
      if (isOld) {
        return res.status(400).json({
          message: "New password cannot match any previously used password",
        });
      }
    }
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    // Add the old password to the oldPasswords array
    user.oldPasswords.push(user.password);
    // Update the password and revoke all existing sessions (refresh tokens)
    user.password = hashedPassword;
    user.refreshTokens = [];
    await user.save();
    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    throw error;
  }
};

export const getTherapists = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query, 50);
    const sort = parseSortParams(req.query, [
      "firstName",
      "lastName",
      "createdAt",
    ]);
    const filter = parseFilterParams(req.query, ["firstName", "lastName"]);

    // Add role filter
    filter.role = "therapist";

    const total = await User.countDocuments(filter);
    const therapists = await User.find(filter)
      .select("-password -oldPasswords -refreshTokens")
      .sort(sort)
      .limit(limit)
      .skip(offset);

    res
      .status(200)
      .json(formatPaginatedResponse(therapists, total, page, limit));
  } catch (error) {
    throw error;
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const { limit, offset } = getPaginationParams(req.query, 500);
    const sort = parseSortParams(req.query, [
      "firstName",
      "lastName",
      "email",
      "createdAt",
    ]);
    const filter = parseFilterParams(req.query, [
      "firstName",
      "lastName",
      "email",
      "role",
    ]);

    const users = await User.find(filter)
      .select("-password -oldPasswords -resetPasswordToken -resetPasswordExpire -refreshTokens")
      .populate("therapist", "firstName lastName username")
      .sort(sort)
      .limit(limit)
      .skip(offset);

    res.status(200).json(users);
  } catch (error) {
    throw error;
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      // Always return success to prevent email enumeration
      return res
        .status(200)
        .json({ success: true, data: "Password reset email sent" });
    }

    // Get reset token
    const resetToken = crypto.randomBytes(20).toString("hex");

    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Set expire - 10 minutes
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    await user.save();

    // Create reset url - use the origin that actually made the request so the
    // link points at the right frontend (dev vs production) instead of a fixed URL.
    const resetUrl = `${getClientOrigin(req)}/reset-password/${resetToken}`;

    // HTML email message
    const message = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { margin:0; padding:0; background:#f8fafc; font-family:'Inter',system-ui,sans-serif; color: #1f2937; }
        .email-container { max-width: 620px; margin: 40px auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 15px 40px rgba(0,0,0,0.07); }
        .header { background: linear-gradient(135deg, #10b981, #059669); padding: 50px 40px; text-align: center; color: white; }
        .header h1 { margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; }
        .header p { margin: 12px 0 0; font-size: 17px; opacity: 0.95; }
        .content { padding: 45px 40px; }
        .greeting { font-size: 20px; font-weight: 600; color: #111827; margin: 0 0 12px 0; }
        .message { color: #374151; line-height: 1.75; font-size: 16.5px; margin-bottom: 35px; }
        .button-container { text-align: center; margin: 40px 0; }
        .button { display: inline-block; background: #10b981; color: white; padding: 18px 42px; font-size: 17px; font-weight: 600; text-decoration: none; border-radius: 14px; box-shadow: 0 8px 25px rgba(16, 185, 129, 0.35); }
        .warning { background: #fefce8; border-left: 5px solid #eab308; padding: 20px; border-radius: 12px; margin: 35px 0; color: #854d0e; font-size: 15.5px; line-height: 1.6; }
        .footer { background: #f1f5f9; padding: 35px 40px; text-align: center; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>Therabridge</h1>
            <p>Reset Your Password</p>
        </div>
        <div class="content">
            <p class="greeting">Hey ${user.firstName || "there"},</p>
            <p class="message">
                You requested to reset your password for your Therabridge account.<br><br>
                Click the button below to create a new one. This link will expire in <strong>10 minutes</strong> for your security.
            </p>
            <div class="button-container">
                <a href="${resetUrl}" style="color: white; text-decoration: none;" class="button" target="_blank">Reset Password Now</a>
            </div>
            <div class="warning">
                <strong>⚠️ Didn't request this?</strong><br>
                If you didn't ask for a password reset, you can safely ignore this email. Your account stays protected.
            </div>
        </div>
        <div class="footer">
            <p><strong>Therabridge</strong> • Your mental wellness companion</p>
            <p>© ${new Date().getFullYear()} Therabridge. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;

    try {
      await sendEmail({
        email: user.email,
        subject: "Password Reset - Therabridge",
        message,
        html: message,
      });
    } catch (err) {
      logger.error({ err }, "Failed to send password reset email");
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(502).json({
        error: {
          message:
            process.env.NODE_ENV === "production"
              ? "We couldn't send the password reset email right now. Please try again in a few minutes."
              : `We couldn't send the password reset email: ${err.message}`,
          code: "EMAIL_FAILED",
        },
      });
    }

    res
      .status(200)
      .json({ success: true, data: "Password reset email sent" });
  } catch (error) {
    throw error;
  }
};

export const resetPassword = async (req, res) => {
  try {
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: { message: "Invalid or expired token.", code: "BAD_REQUEST" } });
    }

    user.password = await bcrypt.hash(req.body.password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    // Revoke all existing sessions so other devices must log in again
    user.refreshTokens = [];
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    throw error;
  }
};

export const updatePrivacy = async (req, res) => {
  try {
    const { privacySettings } = req.body;
    const allowedFields = [
      "firstName",
      "lastName",
      "email",
      "dateOfBirth",
      "bio",
    ];

    const updates = {};
    let privateCount = 0;

    for (const field of allowedFields) {
      if (privacySettings[field] !== undefined) {
        if (!["public", "private"].includes(privacySettings[field])) {
          return res
            .status(400)
            .json({ error: { message: `Invalid value for ${field}.`, code: "VALIDATION_ERROR" } });
        }
        updates[`privacySettings.${field}`] = privacySettings[field];
        if (privacySettings[field] === "private") privateCount++;
      }
    }

    if (privateCount > 3) {
      return res
        .status(400)
        .json({ error: { message: "You can hide at most 3 profile fields.", code: "VALIDATION_ERROR" } });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true },
    ).select("-password -oldPasswords -refreshTokens");

    res.status(200).json({
      message: "Privacy settings updated",
      privacySettings: user.privacySettings,
    });
  } catch (error) {
    throw error;
  }
};

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
      "-password -oldPasswords -resetPasswordToken -resetPasswordExpire -refreshTokens",
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

// ====================== DATA PRIVACY ======================

// Records the user's acknowledgement that Therry is an AI companion, not a
// licensed therapist. Persistent (unlike the per-session banner).
export const acknowledgeAiDisclosure = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { aiDisclosureAcknowledgedAt: new Date() } },
      { new: true },
    ).select("aiDisclosureAcknowledgedAt");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: "ai_disclosure_ack",
      targetType: "user",
      target: req.user.id,
      detail: { acknowledgedAt: user.aiDisclosureAcknowledgedAt },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });
    res.status(200).json({ acknowledgedAt: user.aiDisclosureAcknowledgedAt });
  } catch (error) {
    throw error;
  }
};

// Returns a JSON bundle of every piece of data the platform holds about the
// requesting user (GDPR-style data portability). Encrypted fields are
// decrypted so the export is human-readable.
export const exportMyData = async (req, res) => {
  try {
    const userId = req.user.id;

    const [
      user,
      moods,
      crises,
      therryMessages,
      notifications,
      messages,
      communities,
      exerciseLogs,
      pushSubscriptions,
      safetyPlan,
    ] = await Promise.all([
      User.findById(userId).select(
        "-password -oldPasswords -resetPasswordToken -resetPasswordExpire -refreshTokens",
      ),
      Mood.find({ user: userId }).sort({ createdAt: 1 }).lean(),
      Crisis.find({ user: userId }).sort({ createdAt: 1 }).lean(),
      TherryMessage.find({ user: userId }).sort({ createdAt: 1 }).lean(),
      Notification.find({ recipient: userId }).sort({ createdAt: 1 }).lean(),
      Message.find({
        $or: [{ sender: userId }, { recipient: userId }],
      }).sort({ createdAt: 1 }).lean(),
      Community.find({
        $or: [{ owner: userId }, { members: userId }],
      }).sort({ createdAt: 1 }).lean(),
      ExerciseLog.find({ user: userId }).sort({ createdAt: 1 }).lean(),
      PushSubscription.find({ user: userId }).sort({ createdAt: 1 }).lean(),
      SafetyPlan.findOne({ user: userId }).lean(),
    ]);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const exportedAt = new Date().toISOString();
    const data = {
      exportedAt,
      platform: "Therabridge",
      user: user.toObject(),
      messages: messages.map((m) => ({ ...m, content: decryptField(m.content) })),
      communities: communities.map((c) => ({
        ...c,
        messages: (c.messages || []).map((msg) => ({
          ...msg,
          content: decryptField(msg.content),
        })),
      })),
      moods: moods.map((m) => ({ ...m, note: decryptField(m.note) })),
      crises: crises.map((c) => ({ ...c, description: decryptField(c.description) })),
      therryMessages: therryMessages.map((t) => ({
        ...t,
        content: decryptField(t.content),
      })),
      notifications: notifications.map((n) => ({
        ...n,
        body: decryptField(n.body),
      })),
      exerciseLogs,
      pushSubscriptions,
      safetyPlan: safetyPlan
        ? {
            ...safetyPlan,
            warningSigns: (safetyPlan.warningSigns || []).map(decryptField),
            internalCoping: (safetyPlan.internalCoping || []).map(decryptField),
            distractionPeople: (safetyPlan.distractionPeople || []).map(decryptField),
            distractionSettings: (safetyPlan.distractionSettings || []).map(decryptField),
            helpPeople: (safetyPlan.helpPeople || []).map(decryptField),
            professionals: (safetyPlan.professionals || []).map(decryptField),
            meansRestriction: (safetyPlan.meansRestriction || []).map(decryptField),
            reasonsForLiving: (safetyPlan.reasonsForLiving || []).map(decryptField),
          }
        : null,
      recordCounts: {
        messages: messages.length,
        communities: communities.length,
        moods: moods.length,
        crises: crises.length,
        therryMessages: therryMessages.length,
        notifications: notifications.length,
        exerciseLogs: exerciseLogs.length,
        pushSubscriptions: pushSubscriptions.length,
        safetyPlan: safetyPlan ? 1 : 0,
      },
    };

    await logAccess({
      actor: userId,
      actorRole: req.user.role,
      action: "data_export",
      targetType: "user",
      target: userId,
      detail: { exportedAt, recordCounts: data.recordCounts },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });

    res.set(
      "Content-Disposition",
      `attachment; filename="therabridge-data-${userId}.json"`,
    );
    res.status(200).json(data);
  } catch (error) {
    throw error;
  }
};

// Therapists see the users assigned to them (their client roster)
export const getTherapistClients = async (req, res) => {
  try {
    const clients = await User.find({ therapist: req.user.id })
      .select("_id username firstName lastName avatar bio email createdAt role")
      .sort({ createdAt: -1 });

    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: "client_roster_view",
      targetType: "user",
      detail: { count: clients.length },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });

    res.status(200).json(clients);
  } catch (error) {
    throw error;
  }
};

// Therapist adds a regular user to their roster (establishes the management link)
export const addTherapistClient = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (user.role !== "user") {
      return res.status(400).json({ message: "Only regular users can be added as clients." });
    }
    if (user.therapist && user.therapist.toString() !== req.user.id) {
      return res.status(409).json({ message: "This user already has a therapist." });
    }

    user.therapist = req.user.id;
    await user.save();

    res.status(200).json({
      message: "Client added to your roster.",
      client: { _id: user._id, username: user.username, firstName: user.firstName, lastName: user.lastName, avatar: user.avatar },
    });
  } catch (error) {
    throw error;
  }
};

// Admin assigns (or removes) a therapist for a user
export const assignTherapist = async (req, res) => {
  try {
    const { userId, therapistId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (therapistId) {
      const therapist = await User.findById(therapistId);
      if (!therapist || therapist.role !== "therapist") {
        return res.status(400).json({ message: "Invalid therapist." });
      }
      user.therapist = therapistId;
    } else {
      user.therapist = null;
    }

    await user.save();
    res.status(200).json({ message: "Therapist assignment updated.", user: { _id: user._id, therapist: user.therapist } });
  } catch (error) {
    throw error;
  }
};
