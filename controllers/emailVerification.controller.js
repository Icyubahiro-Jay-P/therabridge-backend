import User from "../models/user.model.js";
import logger from "../utils/logger.js";
import { hashVerificationCode, issueVerificationCode } from "./user.utils.js";

// Confirms the 6-digit code emailed at registration. On success the account
// is marked verified (isAccountVerified = true) and the stored code is cleared.
export const verifyEmail = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND" } });
    }
    if (user.isAccountVerified) {
      return res.status(400).json({ error: { message: "Your email is already verified.", code: "ALREADY_VERIFIED" } });
    }
    if (!user.verificationCode || !user.verificationCodeExpire) {
      return res.status(400).json({ error: { message: "No verification code was issued. Request a new one.", code: "NO_CODE" } });
    }
    if (new Date(user.verificationCodeExpire).getTime() < Date.now()) {
      return res.status(400).json({ error: { message: "This code has expired. Request a new one.", code: "CODE_EXPIRED" } });
    }
    if (hashVerificationCode(code.trim()) !== user.verificationCode) {
      return res.status(400).json({ error: { message: "Incorrect code. Please check the email we sent you.", code: "INVALID_CODE" } });
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
export const resendVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND" } });
    }
    if (user.isAccountVerified) {
      return res.status(400).json({ error: { message: "Your email is already verified.", code: "ALREADY_VERIFIED" } });
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
