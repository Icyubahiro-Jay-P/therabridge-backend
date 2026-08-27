import mongoose from "mongoose";

// A screenshot/screen-capture event recorded for a protected piece of content.
//
// Privacy: we store ONLY minimal metadata describing the event. We never store
// screenshot images, never attempt to secretly upload a user's screen, and
// never collect device information beyond the coarse platform + detection
// method the client honestly reports.
//
// Deduplication: a single real capture may produce several browser/native
// signals. `ingestionKey` (contentId + actorId + eventType + detection window)
// is used with Redis SET NX as the primary dedup and a Mongo unique index as
// the backstop, so a single capture yields at most one notification while still
// allowing legitimate captures that happen at different times.
const screenshotEventSchema = new mongoose.Schema(
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
    // The authenticated user who took (or is suspected of taking) the capture.
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // The content owner to notify. Derived server-side from the viewing
    // session / database, never trusted from the client.
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    viewingSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ViewingSession",
      default: null,
    },
    platform: {
      type: String,
      enum: ["web", "android", "ios"],
      default: "web",
    },
    detectionMethod: {
      type: String,
      enum: [
        "android_os",
        "ios_os",
        "web_heuristic",
        "web_visibility",
        "manual",
        "unknown",
      ],
      default: "unknown",
    },
    confidence: {
      type: String,
      enum: ["confirmed", "probable", "heuristic", "unknown"],
      default: "unknown",
    },
    eventType: {
      type: String,
      enum: ["SCREENSHOT", "SCREEN_RECORDING", "SCREEN_CAPTURE", "UNKNOWN_CAPTURE"],
      default: "UNKNOWN_CAPTURE",
    },
    // Client-generated idempotency key. The server also derives its own.
    eventId: {
      type: String,
      required: true,
      unique: true,
    },
    // contentId + actorId + eventType + detection window. Unique backstop for
    // dedup so bursty browser signals collapse into one server-side event.
    ingestionKey: {
      type: String,
      required: true,
      unique: true,
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Primary lookup patterns: list/audit by content, by actor, and dedup backstop.
screenshotEventSchema.index({ contentId: 1, createdAt: -1 });
screenshotEventSchema.index({ actorId: 1, createdAt: -1 });
screenshotEventSchema.index({ ownerId: 1, createdAt: -1 });

export default mongoose.model("ScreenshotEvent", screenshotEventSchema);
