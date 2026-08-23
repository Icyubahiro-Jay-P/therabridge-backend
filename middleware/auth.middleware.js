import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

export const authMiddleware = async (req, res, next) => {
  // Support token from cookie or Authorization header (Bearer)
  let token = req.cookies && req.cookies.token;
  if (
    !token &&
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res
      .status(401)
      .json({ error: { message: "Authentication required. Please log in.", code: "UNAUTHORIZED", category: "USER" } });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("isDisabled role");
    if (!user) {
      return res
        .status(401)
        .json({ error: { message: "User account no longer exists.", code: "UNAUTHORIZED", category: "USER" } });
    }
    if (user.isDisabled) {
      return res
        .status(403)
        .json({ error: { message: "Account has been disabled. Contact support.", code: "FORBIDDEN", category: "USER" } });
    }

    // Prefer authoritative role from DB in case it changed since token issuance
    req.user = { id: decoded.id, role: user.role };
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ error: { message: "Session expired. Please log in again.", code: "UNAUTHORIZED", category: "USER" } });
    }
    return res
      .status(401)
      .json({ error: { message: "Invalid or malformed token.", code: "UNAUTHORIZED", category: "USER" } });
  }
};

// Middleware for the 2FA validation endpoint, accepts only "2fa-pending" tokens
export const twoFactorAuthMiddleware = async (req, res, next) => {
  let token = req.cookies && req.cookies.token;
  if (
    !token &&
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res
      .status(401)
      .json({ error: { message: "Authentication required.", code: "AUTH_REQUIRED" } });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== "2fa-pending") {
      return res
        .status(401)
        .json({ error: { message: "Invalid token type.", code: "INVALID_TOKEN" } });
    }

    const user = await User.findById(decoded.id).select("isDisabled role twoFactorEnabled");
    if (!user) {
      return res
        .status(401)
        .json({ error: { message: "User account no longer exists.", code: "NOT_FOUND" } });
    }
    if (user.isDisabled) {
      return res
        .status(403)
        .json({ error: { message: "Account has been disabled.", code: "ACCOUNT_DISABLED" } });
    }
    if (!user.twoFactorEnabled) {
      return res
        .status(400)
        .json({ error: { message: "Two-factor authentication is not enabled.", code: "NOT_ENABLED" } });
    }

    req.user = { id: decoded.id, role: user.role };
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ error: { message: "Two-factor session expired. Please log in again.", code: "TOKEN_EXPIRED" } });
    }
    return res.status(401).json({ error: { message: "Invalid token.", code: "INVALID_TOKEN" } });
  }
};
