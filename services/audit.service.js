import AuditLog from "../models/auditLog.model.js";

// Fire-and-forget audit logging. Intentionally swallows errors so auditing
// never blocks or breaks the request it wraps; failures are surfaced in logs.
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
  } catch (err) {
    console.error("[audit] failed to write log:", err.message);
  }
};

// Helpers for pulling the client IP and user agent off a request.
export const ipFromReq = (req) =>
  req.headers["x-forwarded-for"]
    ? String(req.headers["x-forwarded-for"]).split(",")[0].trim()
    : req.socket?.remoteAddress || null;

export const uaFromReq = (req) => req.headers["user-agent"] || null;
