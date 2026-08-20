import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import {
  signAccessToken,
  createRefreshToken,
  hashRefreshToken,
  setAuthCookies,
} from "../utils/tokens.js";
import { updateLoginStreak } from "./user.utils.js";

// POST /2fa/setup — Generate TOTP secret + QR code (does not enable yet)
export const setupTwoFactor = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND" } });
    }

    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: { message: "Two-factor authentication is already enabled.", code: "ALREADY_ENABLED" } });
    }

    const secret = speakeasy.generateSecret({
      name: `TheraBridge:${user.email}`,
      issuer: "TheraBridge",
      length: 20,
    });

    // Store the secret temporarily (not enabled yet until verified)
    user.twoFactorSecret = secret.base32;
    await user.save();

    const otpauthUrl = secret.otpauth_url;
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    res.status(200).json({
      message: "Scan the QR code with your authenticator app, then verify with a code.",
      qrCode: qrCodeDataUrl,
      secret: secret.base32,
    });
  } catch (error) {
    throw error;
  }
};

// POST /2fa/verify-setup — Verify initial TOTP code and enable 2FA
export const verifyTwoFactorSetup = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND" } });
    }

    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: { message: "Two-factor authentication is already enabled.", code: "ALREADY_ENABLED" } });
    }

    if (!user.twoFactorSecret) {
      return res.status(400).json({ error: { message: "Please start 2FA setup first.", code: "SETUP_REQUIRED" } });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: code,
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ error: { message: "Invalid code. Please try again.", code: "INVALID_CODE" } });
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString("hex")
    );

    user.twoFactorEnabled = true;
    user.twoFactorBackupCodes = backupCodes.map((c) =>
      bcrypt.hashSync(c, 10)
    );
    await user.save();

    res.status(200).json({
      message: "Two-factor authentication enabled successfully.",
      backupCodes,
    });
  } catch (error) {
    throw error;
  }
};

// POST /2fa/validate — Validate TOTP during login (uses 2FA-pending token)
export const validateTwoFactor = async (req, res) => {
  try {
    const { code } = req.body;

    // req.user is set by authMiddleware after verifying the 2FA-pending token
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND" } });
    }

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ error: { message: "Two-factor authentication is not enabled.", code: "NOT_ENABLED" } });
    }

    // Check if it's a backup code (8-char hex)
    let isBackupCode = false;
    if (/^[0-9a-f]{8}$/.test(code)) {
      const matchedIndex = user.twoFactorBackupCodes.findIndex((hashed) =>
        bcrypt.compareSync(code, hashed)
      );
      if (matchedIndex !== -1) {
        isBackupCode = true;
        // Remove the used backup code
        user.twoFactorBackupCodes.splice(matchedIndex, 1);
        await user.save();
      }
    }

    if (!isBackupCode) {
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: code,
        window: 1,
      });

      if (!verified) {
        return res.status(400).json({ error: { message: "Invalid code.", code: "INVALID_CODE" } });
      }
    }

    // 2FA verified — issue full tokens
    const accessToken = signAccessToken(user);
    const { token: refreshToken, jti } = createRefreshToken(user);
    user.refreshTokens.push(hashRefreshToken(jti));
    await user.save();
    setAuthCookies(res, { accessToken, refreshToken });

    await updateLoginStreak(user);

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
        privacySettings: user.privacySettings,
        exerciseScore: user.exerciseScore,
        loginStreak: user.loginStreak,
        exerciseStreak: user.exerciseStreak,
        longestLoginStreak: user.longestLoginStreak,
        longestExerciseStreak: user.longestExerciseStreak,
        isAccountVerified: user.isAccountVerified,
        twoFactorEnabled: true,
      },
    });
  } catch (error) {
    throw error;
  }
};

// DELETE /2fa/disable — Disable 2FA (requires password + TOTP code)
export const disableTwoFactor = async (req, res) => {
  try {
    const { password, code } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND" } });
    }

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ error: { message: "Two-factor authentication is not enabled.", code: "NOT_ENABLED" } });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: { message: "Invalid password.", code: "AUTH_ERROR" } });
    }

    // Verify TOTP code
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: code,
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ error: { message: "Invalid code.", code: "INVALID_CODE" } });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.twoFactorBackupCodes = [];
    await user.save();

    res.status(200).json({ message: "Two-factor authentication disabled." });
  } catch (error) {
    throw error;
  }
};

// GET /2fa/status — Check if 2FA is enabled
export const getTwoFactorStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("twoFactorEnabled twoFactorBackupCodes");
    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND" } });
    }

    res.status(200).json({
      enabled: user.twoFactorEnabled,
      backupCodesRemaining: user.twoFactorBackupCodes.length,
    });
  } catch (error) {
    throw error;
  }
};
