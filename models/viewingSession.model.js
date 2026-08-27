import mongoose from "mongoose";

// A viewing session tracks a single authenticated user's active view of one
// piece of protected content (a future private photo/video/snap, a sensitive
// document, a profile, etc.). Sessions gate screenshot-event reporting: a
// report is only accepted when it references an unexpired session created for
// the same authenticated actor and content. This prevents an attacker from
// POSTing screenshot events with arbitrary contentIds to spam notifications.
const viewingSessionSchema = new mongoose.Schema(
  {
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    contentType: {
      type: String,
      enum: ["message", "snap", "photo", "video", "document", "profile", "other"],
      default: "other",
    },
    viewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Server-issued random token returned when the session is created. The
    // client echoes it back when reporting an event so the server can prove the
    // report belongs to a real, current viewing experience.
    sessionToken: {
      type: String,
      required: true,
      unique: true,
    },
    protectionMode: {
      type: String,
      enum: ["notify", "prevent", "notify-and-prevent"],
      default: "notify",
    },
    platform: {
      type: String,
      enum: ["web", "android", "ios"],
      default: "web",
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Lookup a session by its token efficiently.
viewingSessionSchema.index({ sessionToken: 1 }, { unique: true });
// Find live sessions for an actor+content quickly.
viewingSessionSchema.index({ viewerId: 1, contentId: 1, endedAt: 1 });
// Purge old sessions by creation time for retention.
viewingSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default mongoose.model("ViewingSession", viewingSessionSchema);
