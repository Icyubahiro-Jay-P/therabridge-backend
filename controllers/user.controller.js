// Barrel file — re-exports all split modules so route imports stay unchanged.
export { register, login, logout, refresh } from "./auth.controller.js";
export { forgotPassword, resetPassword, changePassword } from "./password.controller.js";
export { verifyEmail, resendVerification } from "./emailVerification.controller.js";
export { profile, getUserProfile, getUserById, updateProfile, getTherapists, getAllUsers } from "./profile.controller.js";
export { uploadProfilePicture, deleteAvatar } from "./avatar.controller.js";
export { deleteProfile, updatePrivacy, acknowledgeAiDisclosure, exportMyData } from "./account.controller.js";
export { disableUser, changeUserRole, deleteUserByAdmin, getFullUserData } from "./admin.controller.js";
export { getTherapistClients, addTherapistClient, assignTherapist } from "./therapistClients.controller.js";
export { setupTwoFactor, verifyTwoFactorSetup, validateTwoFactor, disableTwoFactor, getTwoFactorStatus } from "./twoFactor.controller.js";
