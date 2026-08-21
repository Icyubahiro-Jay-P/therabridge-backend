import User from "../models/user.model.js";
import logger from "../utils/logger.js";
import { hashVerificationCode, issueVerificationCode } from "./user.utils.js";

// Confirms the 6-digit code emailed at registration. On success the account
// is marked verified (isAccountVerified = true) and the stored code is cleared.
// This endpoint is public (no auth required) — the code itself proves identity.
export const verifyEmail = async (req, res) => {
  try {
    const { code } = req.body;
    const hashedCode = hashVerificationCode(code.trim());
    const user = await User.findOne({
      verificationCode: hashedCode,
      verificationCodeExpire: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ error: { message: "Invalid or expired verification code.", code: "INVALID_CODE" } });
    }
    if (user.isAccountVerified) {
      return res.status(400).json({ error: { message: "Your email is already verified.", code: "ALREADY_VERIFIED" } });
    }
    user.isAccountVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpire = undefined;
    await user.save();
    res.status(200).json({ message: "Email verified successfully.", isAccountVerified: true });
  } catch (error) {
    throw error;
  }
};

// Generates a brand-new verification code and emails it. Used when the
// original email is lost, expired, or never arrived.
// This endpoint is public (no auth required) — user provides their email.
export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: { message: "Email is required.", code: "VALIDATION_ERROR" } });
    }
    const user = await User.findOne({ email });
    if (!user) {
      // Return success even if user not found to prevent email enumeration
      return res.status(200).json({ message: "If an account exists with that email, a new code has been sent.", resendCooldownSeconds: 60 });
    }
    if (user.isAccountVerified) {
      return res.status(200).json({ message: "If an account exists with that email, a new code has been sent.", resendCooldownSeconds: 60 });
    }
    try {
      await issueVerificationCode(user);
    } catch (err) {
      logger.error({ err, userId: user._id }, "Failed to resend verification email");
      return res.status(502).json({
        error: {
          message:
            process.env.NODE_ENV === "production"
              ? "We couldn't send the verification email right now. Please try again in a few minutes."
              : `We couldn't send the verification email: ${err.message}`,
          code: "EMAIL_FAILED",
        },
      });
    }
    res.status(200).json({ message: "Verification code sent.", resendCooldownSeconds: 60 });
  } catch (error) {
    throw error;
  }
};
