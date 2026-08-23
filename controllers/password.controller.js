import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import sendEmail from "../utils/nodemailer.js";
import getClientOrigin from "../utils/clientOrigin.js";
import logger from "../utils/logger.js";

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
                <strong>Didn't request this?</strong><br>
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

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    // Check if current password is correct
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND", category: "USER" } });
    }
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      return res.status(400).json({ error: { message: "Invalid current password", code: "VALIDATION_ERROR", category: "USER" } });
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
