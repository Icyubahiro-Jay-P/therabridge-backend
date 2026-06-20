import mongoose from "bcryptjs";

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    minlength: [2, "First name must be at least 2 characters long"]
  },
  lastName: {
    type: String,
    required: true,
    minlength: [2, "Last name must be at least 2 characters long"]
  },
  username: {
    type: String,
    required: true,
    unique: true,
    minlength: [3, "Username must be at least 3 characters long"]
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true,
    minlength: [8, "Password must be at least 8 characters long"]
  },
  oldPasswords: {
    type: [String],
    default: []
  },
  isAccountVerified: {
    type: Boolean,
    default: false
  },
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetTokenExpiry: {
    type: Date,
    default: null
  },
  role: {
    type: String,
    enum: ["user", "admin", "therapist"],
    default: "user"
  }
});

export default mongoose.model("User", userSchema);