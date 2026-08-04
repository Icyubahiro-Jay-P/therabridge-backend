import express from "express";
import {
  register,
  login,
  logout,
  refresh,
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
  disableUser,
  changeUserRole,
  deleteUserByAdmin,
  getFullUserData,
  getTherapistClients,
  addTherapistClient,
  assignTherapist,
} from "../controllers/user.controller.js";

import { authMiddleware } from "../middleware/auth.middleware.js";
import { uploadProfilePic } from "../middleware/upload.js";
import { validate } from "../utils/validation.js";
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  privacySettingsSchema,
  inviteMemberSchema,
  assignTherapistSchema,
} from "../utils/validation.js";

const router = express.Router();

// ====================== PUBLIC ROUTES ======================
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/logout", logout);
router.post("/refresh", refresh);
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password/:token", validate(resetPasswordSchema), resetPassword);

// ====================== PROTECTED ROUTES ======================
router.get("/profile", authMiddleware, profile);
router.get("/users", authMiddleware, getAllUsers);
router.get("/therapists", authMiddleware, getTherapists);
router.get("/users/:id", authMiddleware, getUserById);

router.put("/profile", authMiddleware, validate(updateProfileSchema), updateProfile);
router.delete("/profile", authMiddleware, deleteProfile);

router.post("/change-password", authMiddleware, validate(changePasswordSchema), changePassword);
router.post(
  "/upload-avatar",
  authMiddleware,
  uploadProfilePic,
  uploadProfilePicture,
);
router.put("/privacy", authMiddleware, validate(privacySettingsSchema), updatePrivacy);

// Admin routes
router.put("/admin/disable/:id", authMiddleware, disableUser);
router.put("/admin/role/:id", authMiddleware, changeUserRole);
router.delete("/admin/user/:id", authMiddleware, deleteUserByAdmin);
router.put("/admin/therapist", authMiddleware, validate(assignTherapistSchema), assignTherapist);

// Therapist routes
router.get("/therapist/user/:id", authMiddleware, getFullUserData);
router.get("/therapist/clients", authMiddleware, getTherapistClients);
router.post("/therapist/clients", authMiddleware, validate(inviteMemberSchema), addTherapistClient);

router.get("/:username", getUserProfile);

router.get("/", (req, res) => {
  res.status(200).json({ message: "User API is running" });
});

export default router;
