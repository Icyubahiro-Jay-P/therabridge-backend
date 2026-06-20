import mongoose from "mongoose";

// Direct Message model — one message between two users
const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const Message = mongoose.model("Message", messageSchema);

// Community Room model — group chat with unique invite key
const communityMessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const communitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      minlength: [2, "Community name must be at least 2 characters"],
      maxlength: 60,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Unique invite key — every user must have this key to join
    inviteKey: {
      type: String,
      required: true,
      unique: true,
    },
    messages: [communityMessageSchema],
    description: {
      type: String,
      default: "",
      maxlength: 200,
    },
  },
  { timestamps: true }
);

export const Community = mongoose.model("Community", communitySchema);
