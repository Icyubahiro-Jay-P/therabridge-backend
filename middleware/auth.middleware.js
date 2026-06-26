import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

export const authMiddleware = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: "Authentication required. Please log in." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("isDisabled role");
    if (!user) {
      return res.status(401).json({ message: "User account no longer exists." });
    }
    if (user.isDisabled) {
      return res.status(403).json({ message: "Account has been disabled. Contact support." });
    }
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Session expired. Please log in again." });
    }
    return res.status(401).json({ message: "Invalid or malformed token." });
  }
};
