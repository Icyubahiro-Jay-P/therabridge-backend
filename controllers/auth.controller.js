import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import logger from "../utils/logger.js";
import {
  signAccessToken,
  signTwoFactorToken,
  createRefreshToken,
  hashRefreshToken,
  setAuthCookies,
  clearAuthCookies,
} from "../utils/tokens.js";
import {
  VERIFICATION_CODE_TTL_MS,
  generateVerificationCode,
  hashVerificationCode,
  sendVerificationEmail,
  updateLoginStreak,
} from "./user.utils.js";

// Login lockout: 5 consecutive failed attempts locks the account for 15 minutes.
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

export const register = async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      firstName,
      lastName,
      dateOfBirth,
    } = req.body;

    if (!username || !email || !password || !firstName || !lastName) {
      return res
        .status(400)
        .json({ message: "All fields are required." });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long." });
    }

    // Username format
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
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

    // Issue a 6-digit email verification code. The account starts unverified
    // until the code is submitted via POST /verify-email.
    const verificationCode = generateVerificationCode();

    const user = new User({
      username,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      dateOfBirth,
      verificationCode: hashVerificationCode(verificationCode),
      verificationCodeExpire: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
    });

    await user.save();

    // Auto-login after register - short-lived access token + rotating refresh token
    const accessToken = signAccessToken(user);
    const { token: refreshToken, jti } = createRefreshToken(user);
    user.refreshTokens.push(hashRefreshToken(jti));
    await user.save();
    setAuthCookies(res, { accessToken, refreshToken });

    await updateLoginStreak(user);

    await sendVerificationEmail(user, verificationCode);

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
        privacySettings: user.privacySettings,
        exerciseScore: user.exerciseScore,
        loginStreak: user.loginStreak,
        exerciseStreak: user.exerciseStreak,
        longestLoginStreak: user.longestLoginStreak,
        longestExerciseStreak: user.longestExerciseStreak,
        isAccountVerified: user.isAccountVerified,
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

    // Account lockout: after MAX_LOGIN_ATTEMPTS failures the account is locked
    // until lockedUntil. Even with the per-IP limiter, a botnet can otherwise
    // guess from many IPs at once.
    const now = Date.now();
    if (user.lockedUntil && user.lockedUntil.getTime() > now) {
      const remainingMin = Math.ceil(
        (user.lockedUntil.getTime() - now) / 60000,
      );
      return res.status(429).json({
        error: {
          message: `Too many failed login attempts. Try again in ${remainingMin} minute${remainingMin === 1 ? "" : "s"}.`,
          code: "ACCOUNT_LOCKED",
        },
      });
    }

    // verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const failed = (user.failedLoginAttempts || 0) + 1;
      if (failed >= MAX_LOGIN_ATTEMPTS) {
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              failedLoginAttempts: 0,
              lockedUntil: new Date(now + LOGIN_LOCKOUT_MS),
            },
          },
        );
        const remainingMin = Math.ceil(LOGIN_LOCKOUT_MS / 60000);
        return res.status(429).json({
          error: {
            message: `Too many failed login attempts. Account locked for ${remainingMin} minutes.`,
            code: "ACCOUNT_LOCKED",
          },
        });
      }
      await User.updateOne(
        { _id: user._id },
        { $set: { failedLoginAttempts: failed } },
      );
      return res.status(401).json({ error: { message: "Invalid credentials.", code: "AUTH_ERROR" } });
    }

    // Successful login: clear any prior lockout state.
    await User.updateOne(
      { _id: user._id },
      { $set: { failedLoginAttempts: 0, lockedUntil: null } },
    );
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;

    if (user.isDisabled) {
      return res
        .status(403)
        .json({ error: { message: "Your account has been disabled. Please contact support.", code: "ACCOUNT_DISABLED" } });
    }

    // If 2FA is enabled, issue a short-lived pending token instead of full tokens
    if (user.twoFactorEnabled) {
      const twoFactorToken = signTwoFactorToken(user);
      return res.status(200).json({
        message: "Two-factor authentication required",
        requiresTwoFactor: true,
        twoFactorToken,
      });
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

    res.status(200).json({ ok: true });
  } catch (error) {
    clearAuthCookies(res);
    res.status(401).json({ message: "Invalid or expired refresh token." });
  }
};
