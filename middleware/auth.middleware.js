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
      .json({ message: "Authentication required. Please log in." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("isDisabled role");
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

    // Prefer authoritative role from DB in case it changed since token issuance
    req.user = { id: decoded.id, role: user.role };
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ message: "Session expired. Please log in again." });
    }
    return res.status(401).json({ message: "Invalid or malformed token." });
  }
};
