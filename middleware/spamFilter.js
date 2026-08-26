import logger from "../utils/logger.js";

export async function spamFilter(req, res, next) {
  const content = req.body?.content || req.body?.message || "";

  if (!content || content.trim() === "") {
    return next();
  }

  try {
    next();
  } catch (err) {
    logger.warn({ err, requestId: req.requestId }, "spam check unavailable");
    next();
  }
}
