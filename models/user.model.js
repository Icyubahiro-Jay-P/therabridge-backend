import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      minlength: [2, "First name must be at least 2 characters long"],
    },
    lastName: {
      type: String,
      required: true,
      minlength: [2, "Last name must be at least 2 characters long"],
    },
    username: {
      type: String,
      required: true,
      unique: true,
      minlength: [3, "Username must be at least 3 characters long"],
    },
    dateOfBirth: {
      type: Date,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      minlength: [8, "Password must be at least 8 characters long"],
    },
    oldPasswords: {
      type: [String],
      default: [],
    },
    isAccountVerified: {
      type: Boolean,
      default: false,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetTokenExpiry: {
      type: Date,
      default: null,
    },
    // Fields used by forgotPassword / resetPassword controller
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpire: {
      type: Date,
      default: null,
    },
    role: {
      type: String,
      enum: ["user", "admin", "therapist"],
      default: "user",
    },
    avatar: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      default: "",
      maxlength: 300,
    },
    chatSettings: {
      readReceipts: { type: Boolean, default: true },
    },
    privacySettings: {
      firstName: { type: String, enum: ["public", "private"], default: "public" },
      lastName: { type: String, enum: ["public", "private"], default: "public" },
      email: { type: String, enum: ["public", "private"], default: "public" },
      dateOfBirth: { type: String, enum: ["public", "private"], default: "public" },
      bio: { type: String, enum: ["public", "private"], default: "public" },
    },
    isDisabled: {
      type: Boolean,
      default: false,
    },
    exerciseScore: {
      type: Number,
      default: 0,
    },
    loginStreak: {
      type: Number,
      default: 0,
    },
    exerciseStreak: {
      type: Number,
      default: 0,
    },
    longestLoginStreak: {
      type: Number,
      default: 0,
    },
    longestExerciseStreak: {
      type: Number,
      default: 0,
    },
    lastLoginDate: {
      type: Date,
      default: null,
    },
    lastExerciseDate: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);