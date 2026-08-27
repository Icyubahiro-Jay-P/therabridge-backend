import User from "../models/user.model.js";
import {
  createViewingSession,
  refreshViewingSession,
  recordScreenshotEvent,
} from "../services/screenshotEvent.service.js";
import { auditAccess } from "../services/audit.service.js";
import { ipFromReq, uaFromReq } from "../services/audit.service.js";

// POST /api/protected/session
// Authenticated user opens protected content. The server mints a viewing
// session + token that later screenshot-event reports must reference.
export const openProtectedContent = async (req, res) => {
  const { contentId, contentType, protectionMode, platform, ownerId } = req.body;

  const result = await createViewingSession({
    actorId: req.user.id,
    contentId,
    contentType,
    protectionMode,
    platform,
    ownerId,
  });

  if (result.error) {
    return res
      .status(400)
      .json({ error: { message: "Invalid session parameters.", code: result.error } });
  }

  auditAccess({
    actor: req.user.id,
    actorRole: req.user.role,
    action: "protected_content_open",
    targetType: result.session.contentType,
    target: result.session.contentId.toString(),
    ip: ipFromReq(req),
    userAgent: uaFromReq(req),
  });

  return res.status(201).json({
    sessionId: result.session._id.toString(),
    sessionToken: result.sessionToken,
    contentType: result.session.contentType,
    contentId: result.session.contentId.toString(),
    protectionMode: result.session.protectionMode,
    platform: result.session.platform,
    expiresAt: result.session.lastSeenAt,
  });
};

// POST /api/protected/session/refresh
// Extends the live window of an existing viewing session.
export const refreshProtectedSession = async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: { message: "sessionId is required.", code: "BAD_REQUEST" } });
  }
  const result = await refreshViewingSession({ sessionId });
  if (result.error) {
    return res.status(404).json({ error: { message: "Session not found.", code: "SESSION_NOT_FOUND" } });
  }
  return res.status(200).json({ sessionId: result.session._id.toString(), lastSeenAt: result.session.lastSeenAt });
};

// POST /api/screenshot-events
// Records a screenshot/capture event tied to a real viewing session. The real
// actor is always req.user.id and the owner is derived server-side from the
// session - neither is taken from the client.
export const reportScreenshotEvent = async (req, res) => {
  const {
    eventId,
    contentId,
    contentType,
    sessionToken,
    platform,
    detectionMethod,
    confidence,
    eventType,
    detectedAt,
  } = req.body;

  let meName = null;
  try {
    const me = await User.findById(req.user.id).select("firstName username");
    meName = me?.firstName || me?.username || null;
  } catch {
    // best-effort; fall back to server id
  }

  const result = await recordScreenshotEvent({
    actorId: req.user.id,
    actorName: meName,
    eventId,
    contentId,
    contentType,
    platform,
    detectionMethod,
    confidence,
    eventType,
    sessionToken,
    detectedAt,
  });

  if (result.status >= 400) {
    return res.status(result.status).json({ error: { ...result.body, requestId: req.requestId } });
  }

  if (result.body?.deduplicated) {
    return res.status(200).json({ message: "duplicate", deduplicated: true });
  }

  auditAccess({
    actor: req.user.id,
    actorRole: req.user.role,
    action: "screenshot_event",
    targetType: result.body.event.contentType,
    target: result.body.event.contentId.toString(),
    detail: { eventType, confidence, detectionMethod },
    ip: ipFromReq(req),
    userAgent: uaFromReq(req),
  });

  return res.status(201).json({ message: "recorded", eventId: result.body.event.eventId });
};
