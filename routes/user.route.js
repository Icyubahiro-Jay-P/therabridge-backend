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
  deleteAvatar,
  updatePrivacy,
  disableUser,
  changeUserRole,
  deleteUserByAdmin,
  getFullUserData,
  getTherapistClients,
  addTherapistClient,
  assignTherapist,
  acknowledgeAiDisclosure,
  exportMyData,
  verifyEmail,
  resendVerification,
  setupTwoFactor,
  verifyTwoFactorSetup,
  validateTwoFactor,
  disableTwoFactor,
  getTwoFactorStatus,
} from "../controllers/user.controller.js";

import { authMiddleware } from "../middleware/auth.middleware.js";
import { twoFactorAuthMiddleware } from "../middleware/auth.middleware.js";
import { requireAdmin, requireTherapist, requireAdminOrTherapist } from "../middleware/role.middleware.js";
import { uploadProfilePic } from "../middleware/upload.js";
import { jsonBody } from "../middleware/jsonBody.js";
import { validate } from "../utils/validation.js";
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  privacySettingsSchema,
  inviteMemberSchema,
  assignTherapistSchema,
  deleteProfileSchema,
  verifyTwoFactorSetupSchema,
  validateTwoFactorSchema,
  disableTwoFactorSchema,
} from "../utils/validation.js";

const router = express.Router();

router.use(jsonBody("10kb"));

// ====================== PUBLIC ROUTES ======================
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/logout", logout);
router.post("/refresh", refresh);
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password/:token", validate(resetPasswordSchema), resetPassword);
router.post("/verify-email", authMiddleware, validate(verifyEmailSchema), verifyEmail);
router.post("/resend-verification", authMiddleware, resendVerification);

// ====================== PROTECTED ROUTES ======================
router.get("/profile", authMiddleware, profile);
router.get("/users", authMiddleware, requireAdmin, getAllUsers);
router.get("/therapists", authMiddleware, getTherapists);
router.get("/users/:id", authMiddleware, getUserById);

router.put("/profile", authMiddleware, validate(updateProfileSchema), updateProfile);
router.delete("/profile", authMiddleware, validate(deleteProfileSchema), deleteProfile);
router.get("/export", authMiddleware, exportMyData);
router.post("/ai-disclosure", authMiddleware, acknowledgeAiDisclosure);

router.post("/change-password", authMiddleware, validate(changePasswordSchema), changePassword);
router.post(
  "/upload-avatar",
  authMiddleware,
  uploadProfilePic,
  uploadProfilePicture,
);
router.delete("/avatar", authMiddleware, deleteAvatar);
router.put("/privacy", authMiddleware, validate(privacySettingsSchema), updatePrivacy);

// Two-Factor Authentication routes
router.post("/2fa/setup", authMiddleware, setupTwoFactor);
router.post("/2fa/verify-setup", authMiddleware, validate(verifyTwoFactorSetupSchema), verifyTwoFactorSetup);
router.post("/2fa/validate", twoFactorAuthMiddleware, validate(validateTwoFactorSchema), validateTwoFactor);
router.delete("/2fa/disable", authMiddleware, validate(disableTwoFactorSchema), disableTwoFactor);
router.get("/2fa/status", authMiddleware, getTwoFactorStatus);

// Admin routes
router.put("/admin/disable/:id", authMiddleware, requireAdmin, disableUser);
router.put("/admin/role/:id", authMiddleware, requireAdmin, changeUserRole);
router.delete("/admin/user/:id", authMiddleware, requireAdmin, deleteUserByAdmin);
router.put("/admin/therapist", authMiddleware, requireAdmin, validate(assignTherapistSchema), assignTherapist);

// Therapist routes
router.get("/therapist/user/:id", authMiddleware, requireAdminOrTherapist, getFullUserData);
router.get("/therapist/clients", authMiddleware, requireTherapist, getTherapistClients);
router.post("/therapist/clients", authMiddleware, requireTherapist, validate(inviteMemberSchema), addTherapistClient);

router.get("/:username", getUserProfile);

router.get("/", (req, res) => {
  res.status(200).json({ message: "User API is running" });
});

export default router;
