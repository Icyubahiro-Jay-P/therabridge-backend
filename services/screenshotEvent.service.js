import crypto from "crypto";
import ScreenshotEvent from "../models/screenshotEvent.model.js";
import ViewingSession from "../models/viewingSession.model.js";
import User from "../models/user.model.js";
import { createNotification } from "./notification.service.js";
import { redis } from "./cache.js";
import logger from "../utils/logger.js";

// ====================== DEDUPLICATION ======================
// Redis SET NX is the primary dedup: a single capture produces several signals,
// and its ingestion key collapses them into one notification. The Mongo unique
// index on ingestionKey is the backstop when Redis is unavailable.
const DEDUP_PREFIX = "ssevt:";
// Captures that occur more than this far apart are treated as distinct events.
const DEDUP_WINDOW_MS = 10_000;

const buildDedupKey = ({ contentId, actorId, eventType, detectedAt }) => {
  const bucket = Math.floor(detectedAt / DEDUP_WINDOW_MS);
  return `${contentId}:${actorId}:${eventType}:${bucket}`;
};

const claimDedup = async (key) => {
  try {
    return (await redis.set(`${DEDUP_PREFIX}${key}`, "1", "EX", Math.ceil(DEDUP_WINDOW_MS / 1000) + 1)) === "OK";
  } catch {
    // Redis unavailable: rely on the Mongo unique index as a backstop.
    return null;
  }
};

// Sessions live for at most this long after their last activity.
const SESSION_INACTIVE_MS = 30 * 60 * 1000; // 30 minutes

// ====================== CONTENT DERIVATION ======================
// Every protected content type gets a type + owner. For chat DMs the "owner"
// notified of a screenshot is the recipient of a message the actor sent, i.e.
// the peer. We deliberately keep contentId as an ObjectId string and resolve
// ownership from the real models - never from client-supplied ownerId.
const CONTENT_TYPES = ["message", "snap", "photo", "video", "document", "profile", "other"];

const normalizeContentId = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^[0-9a-fA-F]{24}$/.test(trimmed)) return null;
  return trimmed;
};

// ====================== VIEWING SESSION ======================
export const createViewingSession = async ({
  actorId,
  contentId,
  contentType = "other",
  protectionMode = "notify",
  platform = "web",
  ownerId = null,
}) => {
  const normId = normalizeContentId(contentId);
  if (!normId) {
    return { error: "INVALID_CONTENT_ID" };
  }
  if (!CONTENT_TYPES.includes(contentType)) {
    return { error: "INVALID_CONTENT_TYPE" };
  }
  if (!["web", "android", "ios"].includes(platform)) {
    return { error: "INVALID_PLATFORM" };
  }
  const modes = ["notify", "prevent", "notify-and-prevent"];
  if (!modes.includes(protectionMode)) {
    return { error: "INVALID_MODE" };
  }

  const sessionToken = crypto.randomBytes(24).toString("base64url");
  const session = new ViewingSession({
    contentId: normId,
    contentType,
    viewerId: actorId,
    ownerId: ownerId ? normalizeContentId(ownerId) : null,
    sessionToken,
    protectionMode,
    platform,
    lastSeenAt: new Date(),
  });
  await session.save();

  return { session, sessionToken };
};

export const refreshViewingSession = async ({ sessionId }) => {
  const session = await ViewingSession.findById(sessionId);
  if (!session) return { error: "SESSION_NOT_FOUND" };
  session.lastSeenAt = new Date();
  await session.save();
  return { session };
};

const findLiveSession = async ({ sessionToken, actorId, contentId }) => {
  const normId = normalizeContentId(contentId);
  if (!normId) return { error: "INVALID_CONTENT_ID" };
  const session = await ViewingSession.findOne({ sessionToken });
  if (!session) return { error: "SESSION_INVALID" };
  if (session.endedAt) return { error: "SESSION_EXPIRED" };
  if (session.viewerId.toString() !== actorId) return { error: "SESSION_INVALID" };
  if (session.contentId.toString() !== normId) return { error: "SESSION_CONTENT_MISMATCH" };
  return { session };
};

// ====================== EVENT RECORDING ======================
export const recordScreenshotEvent = async ({
  actorId,
  actorName,
  eventId,
  contentId,
  contentType = "other",
  platform = "web",
  detectionMethod = "unknown",
  confidence = "unknown",
  eventType = "UNKNOWN_CAPTURE",
  sessionToken,
  detectedAt = Date.now(),
}) => {
  const normId = normalizeContentId(contentId);
  if (!normId) {
    return { status: 400, body: { message: "contentId is invalid.", code: "BAD_REQUEST" } };
  }
  if (!CONTENT_TYPES.includes(contentType)) {
    return { status: 400, body: { message: "contentType is invalid.", code: "BAD_REQUEST" } };
  }
  if (!["web", "android", "ios"].includes(platform)) {
    return { status: 400, body: { message: "platform is invalid.", code: "BAD_REQUEST" } };
  }
  const validDetection = [
    "android_os",
    "ios_os",
    "web_heuristic",
    "web_visibility",
    "manual",
    "unknown",
  ];
  if (!validDetection.includes(detectionMethod)) {
    return { status: 400, body: { message: "detectionMethod is invalid.", code: "BAD_REQUEST" } };
  }
  const validConfidence = ["confirmed", "probable", "heuristic", "unknown"];
  if (!validConfidence.includes(confidence)) {
    return { status: 400, body: { message: "confidence is invalid.", code: "BAD_REQUEST" } };
  }
  const validEventType = ["SCREENSHOT", "SCREEN_RECORDING", "SCREEN_CAPTURE", "UNKNOWN_CAPTURE"];
  if (!validEventType.includes(eventType)) {
    return { status: 400, body: { message: "eventType is invalid.", code: "BAD_REQUEST" } };
  }
  if (!sessionToken || typeof sessionToken !== "string") {
    return { status: 400, body: { message: "A valid viewing session is required.", code: "SESSION_REQUIRED" } };
  }

  // Verify the report belongs to a real, live viewing session for this actor+content.
  const sessionRes = await findLiveSession({ sessionToken, actorId, contentId: normId });
  if (sessionRes.error) {
    const codeMap = {
      SESSION_INVALID: "SESSION_INVALID",
      SESSION_EXPIRED: "SESSION_EXPIRED",
      SESSION_CONTENT_MISMATCH: "SESSION_CONTENT_MISMATCH",
      INVALID_CONTENT_ID: "BAD_REQUEST",
    };
    logger.warn({ actorId, error: sessionRes.error }, "rejected screenshot event on session verification");
    return { status: sessionRes.error === "SESSION_EXPIRED" ? 410 : 403, body: { message: "Invalid or expired viewing session.", code: codeMap[sessionRes.error] || "SESSION_INVALID" } };
  }
  const session = sessionRes.session;

  // Derive the owner from the session (already server-derived), NOT the client.
  const ownerId = session.ownerId;

  // Idempotency: build a server-side ingestion key so bursty signals from the
  // same viewing window collapse into one event + one notification.
  const ts = new Date(detectedAt).getTime();
  const ingestionKey = buildDedupKey({
    contentId: normId,
    actorId,
    eventType,
    detectedAt: ts,
  });
  const claimed = await claimDedup(ingestionKey);

  // Dedup: look for an existing event with the same key. If Redis said "already
  // claimed" (false), or a Mongo row already exists, suppress the duplicate.
  if (claimed === false || (await ScreenshotEvent.exists({ ingestionKey }))) {
    return { status: 200, body: { message: "duplicate", deduplicated: true } };
  }

  // eventId is a client-generated idempotency token; unique index guards it too.
  const safeEventId =
    eventId && typeof eventId === "string" && eventId.length <= 64 ? eventId : null;
  const resolvedEventId = safeEventId || crypto.randomUUID();

  try {
    const event = await ScreenshotEvent.create({
      contentId: normId,
      contentType,
      actorId,
      ownerId,
      viewingSessionId: session._id,
      platform,
      detectionMethod,
      confidence,
      eventType,
      eventId: resolvedEventId,
      ingestionKey,
      detectedAt: new Date(ts),
    });

    if (ownerId && ownerId.toString() !== actorId) {
      await notifyOwner({
        ownerId,
        actorId,
        actorName,
        contentId: normId,
        contentType,
        eventType,
      });
    }

    return { status: 201, body: { event, idempotencyKey: ingestionKey } };
  } catch (err) {
    // Unique-index collision (event already recorded) => duplicate, not an error.
    if (err?.code === 11000) {
      return { status: 200, body: { message: "duplicate", deduplicated: true } };
    }
    throw err;
  }
};

// ====================== NOTIFICATION ======================
const notifyOwner = async ({ ownerId, actorId, actorName, contentId, contentType, eventType }) => {
  try {
    const actor = await User.findById(actorId).select("firstName username");
    const name = actorName || actor?.firstName || actor?.username || "Someone";

    const typeLabel =
      eventType === "SCREEN_RECORDING"
        ? "recorded"
        : eventType === "SCREEN_CAPTURE"
          ? "captured"
          : "took a screenshot of";
    const isScreenshot = eventType === "SCREENSHOT";

    const body = isScreenshot
      ? `${name} took a screenshot of your ${contentType === "message" ? "message" : "content"}.`
      : `${name} ${typeLabel} your ${contentType === "message" ? "message" : "content"}.`;

    await createNotification(
      ownerId,
      "screenshot",
      "Screenshot alert",
      body,
      { url: "/chat", contentId, contentType, eventType },
      actorId,
      { skipIfOnline: true },
    );
  } catch (err) {
    logger.error({ err, ownerId, actorId }, "failed to create screenshot notification");
  }
};

// ====================== SHARED UTILITIES ======================
export const makeEventId = () => crypto.randomUUID();

// Legacy DM privacy-shield path (no viewing session because DMs aren't
// session-tracked). Records a paper-trail ScreenshotEvent in the new
// collection so web-heuristic captures are auditable, without changing the
// existing in-thread Message flow. contentId is resolved from the most recent
// message between the pair; the peer is the owner to notify.
export const recordLegacyScreenshotEvent = async ({
  actorId,
  peerId,
  contentId = null,
}) => {
  try {
    const resolvedContentId =
      contentId || (await Message.latestContentIdBetween(actorId, peerId));
    if (!resolvedContentId) return { recorded: false };

    const ingestionKey = buildDedupKey({
      contentId: resolvedContentId,
      actorId,
      eventType: "SCREENSHOT",
      detectedAt: Date.now(),
    });
    const claimed = await claimDedup(ingestionKey);
    if (claimed === false || (await ScreenshotEvent.exists({ ingestionKey }))) {
      return { recorded: false, deduplicated: true };
    }

    const event = await ScreenshotEvent.create({
      contentId: resolvedContentId,
      contentType: "message",
      actorId,
      ownerId: peerId,
      viewingSessionId: null,
      platform: "web",
      detectionMethod: "web_heuristic",
      confidence: "heuristic",
      eventType: "SCREENSHOT",
      eventId: crypto.randomUUID(),
      ingestionKey,
      detectedAt: new Date(),
    });
    return { recorded: true, event };
  } catch (err) {
    if (err?.code === 11000) return { recorded: false, deduplicated: true };
    logger.error({ err, actorId, peerId }, "failed to record legacy screenshot event");
    return { recorded: false };
  }
};

export const isSessionTokenValid = async ({ sessionToken, actorId, contentId }) => {
  const res = await findLiveSession({ sessionToken, actorId, contentId });
  return { valid: !res.error };
};

export const normalizeOwnerId = normalizeContentId;
