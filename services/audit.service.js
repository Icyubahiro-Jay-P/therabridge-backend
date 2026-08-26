import AuditLog from "../models/auditLog.model.js";
import { auditQueue } from "./queue.js";
import logger from "../utils/logger.js";

// Fire-and-forget audit logging via BullMQ queue. Intentionally swallows
// errors so auditing never blocks or breaks the request it wraps.
export const logAccess = async ({
  actor = null,
  actorRole = "system",
  action,
  targetType = "user",
  target = null,
  detail = {},
  ip = null,
  userAgent = null,
}) => {
  try {
    await auditQueue.add(
      "log-access",
      {
        actor: actor || null,
        actorRole,
        action,
        targetType,
        target: target || null,
        detail,
        ip: ip || null,
        userAgent: userAgent ? String(userAgent).slice(0, 300) : null,
      },
      { removeOnComplete: true, removeOnFail: { count: 100 } },
    );
  } catch (err) {
    // If queue is unavailable, write directly as fallback
    try {
      await AuditLog.create({
        actor: actor || null,
        actorRole,
        action,
        targetType,
        target: target || null,
        detail,
        ip: ip || null,
        userAgent: userAgent ? String(userAgent).slice(0, 300) : null,
      });
    } catch (fallbackErr) {
      logger.error({ err: fallbackErr, action }, "Failed to write audit log (queue + fallback)");
    }
  }
};

// Worker processor for audit queue
export const processAuditJob = async (job) => {
  await AuditLog.create(job.data);
};

// Helpers for pulling the client IP and user agent off a request.
export const ipFromReq = (req) =>
  req.headers["x-forwarded-for"]
    ? String(req.headers["x-forwarded-for"]).split(",")[0].trim()
    : req.socket?.remoteAddress || null;

export const uaFromReq = (req) => req.headers["user-agent"] || null;
