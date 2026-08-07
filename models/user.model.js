import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      minlength: [2, "First name must be at least 2 characters long"],
      maxlength: [50, "First name must be at most 50 characters long"],
    },
    lastName: {
      type: String,
      required: true,
      minlength: [2, "Last name must be at least 2 characters long"],
      maxlength: [50, "Last name must be at most 50 characters long"],
    },
    username: {
      type: String,
      required: true,
      unique: true,
      minlength: [3, "Username must be at least 3 characters long"],
      maxlength: [30, "Username must be at most 30 characters long"],
    },
    dateOfBirth: {
      type: Date,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      maxlength: [254, "Email must be at most 254 characters long"],
    },
    password: {
      type: String,
      required: true,
      minlength: [8, "Password must be at least 8 characters long"],
      maxlength: [128, "Password must be at most 128 characters long"],
    },
    oldPasswords: {
      type: [String],
      default: [],
    },
    isAccountVerified: {
      type: Boolean,
      default: false,
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
    // Therapist who manages this user (admin or the therapist itself can set it)
    therapist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
      firstName: {
        type: String,
        enum: ["public", "private"],
        default: "public",
      },
      lastName: {
        type: String,
        enum: ["public", "private"],
        default: "public",
      },
      email: { type: String, enum: ["public", "private"], default: "public" },
      dateOfBirth: {
        type: String,
        enum: ["public", "private"],
        default: "public",
      },
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
    // Talking Points earned today (capped at DAILY_POINTS_CAP in utils/points.js).
    // talkingPointsDate stores the day the counter applies to, so the counter
    // can reset at midnight without a cron job.
    talkingPointsToday: {
      type: Number,
      default: 0,
    },
    talkingPointsDate: {
      type: Date,
      default: null,
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
    // Hashed refresh-token identifiers (jti) for session rotation/revocation
    refreshTokens: {
      type: [String],
      default: [],
    },
    // Timestamp of when the user acknowledged that Therry is an AI companion
    // (not a licensed therapist). "null" means the disclosure has not been
    // acknowledged yet.
    aiDisclosureAcknowledgedAt: {
      type: Date,
      default: null,
    },
    // Login lockout: consecutive failed attempts and when the account is
    // locked until. Reset to 0/null on a successful login.
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
    // ISO-3166 alpha-2 country code used to route crisis hotline resources
    countryCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: "US",
      maxlength: 2,
    },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ firstName: 1 });
userSchema.index({ lastName: 1 });
userSchema.index({ therapist: 1 });

export default mongoose.model("User", userSchema);
