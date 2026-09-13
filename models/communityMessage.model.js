import mongoose from "mongoose";
import { decryptFieldLength } from "../utils/crypto.js";

// Community messages live in their own collection (mirroring the DM Message
// model) rather than as an embedded array on the Community document - an
// embedded array has no real pagination and can eventually hit MongoDB's
// 16MB document limit, permanently breaking that community. This also
// enables the same cursor-pagination pattern DM conversations already use.
const communityMessageSchema = new mongoose.Schema(
  {
    community: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // "text" = plain text, "voice" = audio note
    type: {
      type: String,
      enum: ["text", "voice"],
      default: "text",
    },
    content: {
      type: String,
      required: [
        function () { return this.type !== "voice" },
        "Content is required",
      ],
      // Content is stored encrypted at rest, so the plaintext cap is enforced
      // against the decrypted value (the ciphertext envelope is longer).
      validate: {
        validator: (v) => typeof v === "string" && decryptFieldLength(v) <= 2000,
        message: "Message must be at most 2000 characters",
      },
    },
    // Voice note fields (only set when type === "voice")
    audioUrl: {
      type: String,
      default: null,
    },
    duration: {
      type: Number,
      default: null,
    },
    // Reply-to snapshot: stores a frozen copy of the original message so we
    // don't need to populate/lookup at read time.
    replyTo: {
      _id: { type: mongoose.Schema.Types.ObjectId },
      senderUsername: { type: String },
      senderAvatar: { type: String, default: null },
      content: { type: String },
      type: { type: String, enum: ["text", "voice"], default: "text" },
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
  },
  { timestamps: true }
);

// Cursor pagination fetches the most recent page of a community with
// `{ community: id }.sort({ _id: -1 }).limit(n)`, exactly like DM's
// `{ sender, recipient }.sort({ _id: -1 })` - this index serves it directly.
communityMessageSchema.index({ community: 1, _id: -1 });

export const CommunityMessage = mongoose.model("CommunityMessage", communityMessageSchema);
