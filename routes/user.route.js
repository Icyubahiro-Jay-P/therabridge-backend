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
  getTherapists,
  getUserById,
  changePassword,
  uploadProfilePicture,
  updatePrivacy,
} from "../controllers/user.controller.js";

import { authMiddleware } from "../middleware/auth.middleware.js";
import { uploadProfilePic } from "../middleware/upload.js";

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
router.get("/therapists", authMiddleware, getTherapists);
router.get("/users/:id", authMiddleware, getUserById);
router.get("/:username", getUserProfile);   // public — privacy-filtered

router.put("/profile", authMiddleware, updateProfile);      // or patch if you prefer
router.delete("/profile", authMiddleware, deleteProfile);

router.post("/change-password", authMiddleware, changePassword);
router.post("/upload-avatar", authMiddleware, uploadProfilePic, uploadProfilePicture);
router.put("/privacy", authMiddleware, updatePrivacy);

// Catch-all for now (you had this empty)
router.get("/", (req, res) => {
  res.status(200).json({ message: "User API is running 🔥" });
});

export default router;