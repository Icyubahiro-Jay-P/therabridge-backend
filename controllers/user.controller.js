import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sendEmail from "../utils/nodemailer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const register = async (req, res) => {
  try {
    const { username, email, password, firstName, lastName, dateOfBirth } =
      req.body;

    // === Validations ===
    if (!username || !email || !password || !firstName || !lastName || !dateOfBirth) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Password length
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters long." });
    }

    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    const age = today.getFullYear() - birthDate.getFullYear();

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
        return res.status(400).json({ message: "Email is already registered." });
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

    // Auto-login after register — assign JWT cookie
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ message: "Email/username and password are required." });
    }

    // Find user by email or username
    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }
    // verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid password" });
    }
    // assign a token to user using cookie parser
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const logout = (req, res) => {
  res.clearCookie("token");
  res.status(200).json({ message: "Logout successful" });
};

export const profile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// get other user profile by username
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select(
      "-password"
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// get user by ID (admin / chat lookup)
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      const age = today.getFullYear() - birthDate.getFullYear();
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
      { new: true }
    ).select("-password");

    res.status(200).json({ message: "Profile updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
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

    // Delete previous avatar if it was an uploaded file
    if (user.avatar && user.avatar.startsWith("/uploads/")) {
      const oldPath = path.join(__dirname, "..", user.avatar);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
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
      },
    });
  } catch (error) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.status(500).json({ message: error.message });
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
      await User.findByIdAndDelete(req.user.id);
      res.clearCookie("token");
      res.status(200).json({ message: "User deleted successfully" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    // Check if current password is correct
    const user = await User.findById(req.user.id);
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid current password" });
    }
    // check if the new password is not the same as the current password or any of the old passwords
    if (
      currentPassword === newPassword ||
      user.oldPasswords.includes(newPassword)
    ) {
      return res.status(400).json({
        message:
          "New password cannot be the same as the current password or any of the old passwords",
      });
    }
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    // Add the old password to the oldPasswords array
    user.oldPasswords.push(user.password);
    // Update the password
    user.password = hashedPassword;
    await user.save();
    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res
        .status(404)
        .json({ error: "There is no user with that email" });
    }

    // Get reset token
    const resetToken = crypto.randomBytes(20).toString("hex");

    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Set expire — 10 minutes
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    await user.save();

    // Create reset url
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

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
            <h1>🌿 Therabridge</h1>
            <p>Reset Your Password</p>
        </div>
        <div class="content">
            <p class="greeting">Hey ${user.firstName || "there"},</p>
            <p class="message">
                You requested to reset your password for your Therabridge account.<br><br>
                Click the button below to create a new one. This link will expire in <strong>10 minutes</strong> for your security.
            </p>
            <div class="button-container">
                <a href="${resetUrl}" class="button" target="_blank">Reset Password Now</a>
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
        subject: "Password Reset — Therabridge",
        message,
        html: message,
      });

      res.status(200).json({ success: true, data: "Email sent" });
    } catch (err) {
      console.log(err);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ error: "Email could not be sent" });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    // Get hashed token
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    // Set new password
    user.password = await bcrypt.hash(req.body.password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
