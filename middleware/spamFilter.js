import logger from "../utils/logger.js";

// Best-effort duplicate-content guard: rejects the exact same trimmed
// content sent twice in a row by the same user within a short window. This
// is a defense-in-depth backend safety net behind the frontend's own
// double-submit guard (a `sending` check in chat-store/community-store), not
// a replacement for it - a fast double-click/double-Enter that races past
// the frontend guard still gets caught here. Per-process, in-memory state is
// fine for a heuristic like this (it doesn't need to be correct across
// server instances to be useful).
const DUPLICATE_WINDOW_MS = 5000;
const lastMessageByUser = new Map();

export async function spamFilter(req, res, next) {
  const content = req.body?.content || req.body?.message || "";
  const trimmed = content.trim();

  if (!trimmed) {
    return next();
  }

  try {
    const userId = req.user?.id;
    if (userId) {
      const last = lastMessageByUser.get(userId);
      const now = Date.now();
      if (last && last.content === trimmed && now - last.timestamp < DUPLICATE_WINDOW_MS) {
        return res.status(429).json({
          error: { message: "Duplicate message - please wait a moment before resending.", code: "DUPLICATE_MESSAGE" },
        });
      }
      lastMessageByUser.set(userId, { content: trimmed, timestamp: now });
    }
    next();
  } catch (err) {
    logger.warn({ err, requestId: req.requestId }, "spam check unavailable");
    next();
  }
}
