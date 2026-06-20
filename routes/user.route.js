import express from "express";
import {
  register,
  login,
  logout,
  profile,
  getUserProfile,
  updateProfile,
  deleteProfile,
  forgotPassword,
  resetPassword,
  getAllUsers,
  getUserById,
  changePassword,   // added this one too
} from "../controllers/user.controller.js";

import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

// ====================== PUBLIC ROUTES ======================
router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);                    // better as POST for security
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

// ====================== PROTECTED ROUTES ======================
router.get("/profile", authMiddleware, profile);
router.get("/users", authMiddleware, getAllUsers);
router.get("/users/:id", authMiddleware, getUserById);
router.get("/:username", authMiddleware, getUserProfile);   // e.g. /john_doe

router.put("/profile", authMiddleware, updateProfile);      // or patch if you prefer
router.delete("/profile", authMiddleware, deleteProfile);

router.post("/change-password", authMiddleware, changePassword);

// Catch-all for now (you had this empty)
router.get("/", (req, res) => {
  res.status(200).json({ message: "User API is running 🔥" });
});

export default router;