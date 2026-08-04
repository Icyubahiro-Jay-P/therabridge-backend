import mongoose from "mongoose";

// Direct Message model - one message between two users
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
    // "message" = normal DM, "screenshot-notice" = possible-screenshot system
    // notice (paper trail + in-thread display, mirrors Snapchat behavior)
    kind: {
      type: String,
      enum: ["message", "screenshot-notice"],
      default: "message",
    },
    noticeType: {
      type: String,
      enum: [null, "possible_screenshot"],
      default: null,
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
    readAt: {
      type: Date,
      default: null,
    },
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    unsent: {
      type: Boolean,
      default: false,
    },
    edited: {
      type: Boolean,
      default: false,
    },
    editCount: {
      type: Number,
      default: 0,
    },
    editHistory: [
      {
        content: { type: String, required: true },
        editedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

messageSchema.index({ sender: 1, recipient: 1, updatedAt: -1 });
messageSchema.index({ recipient: 1, sender: 1, updatedAt: -1 });
messageSchema.index({ deletedFor: 1 });
messageSchema.index({ kind: 1, createdAt: -1 });

export const Message = mongoose.model("Message", messageSchema);

// Community Room model - group chat with unique invite key
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
  readBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  unsent: {
    type: Boolean,
    default: false,
  },
  edited: {
    type: Boolean,
    default: false,
  },
  editCount: {
    type: Number,
    default: 0,
  },
  editHistory: [
    {
      content: { type: String, required: true },
      editedAt: { type: Date, default: Date.now },
    },
  ],
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
    // Moderators help the owner run the room (approve requests, remove members)
    moderators: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Users who requested to join a private room and are awaiting approval
    pendingMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Unique invite key - every user must have this key to join
    inviteKey: {
      type: String,
      required: true,
      unique: true,
    },
    // Private rooms require moderator approval before someone can join
    isPrivate: {
      type: Boolean,
      default: false,
    },
    category: {
      type: String,
      enum: [
        "general",
        "anxiety",
        "depression",
        "stress",
        "mindfulness",
        "support",
        "therapy",
        "wellness",
      ],
      default: "general",
    },
    rules: {
      type: String,
      default: "",
      maxlength: 500,
    },
    messages: [communityMessageSchema],
    description: {
      type: String,
      default: "",
      maxlength: 200,
    },
    isDisabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

communitySchema.index({ members: 1 });
communitySchema.index({ owner: 1 });
communitySchema.index({ category: 1 });
communitySchema.index({ isPrivate: 1 });
export const Community = mongoose.model("Community", communitySchema);
