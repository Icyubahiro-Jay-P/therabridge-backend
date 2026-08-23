import logger from "../utils/logger.js";
import { checkSpam } from "../services/mlClient.js";

export async function spamFilter(req, res, next) {
  const content = req.body?.content || req.body?.message || "";

  if (!content || content.trim() === "") {
    return next();
  }

  try {
    const result = await checkSpam(content);

    if (result.is_spam) {
      // The spam score is an internal model detail - never expose it.
      return res.status(400).json({
        error: {
          message: "This message looks like spam and was not sent. Please rephrase and try again.",
          code: "SPAM_DETECTED",
          category: "USER",
        },
      });
    }

    req.body._legacy_classification = result;
    next();
  } catch (err) {
    // ML being down must never block messaging; just log and continue.
    logger.warn({ err, requestId: req.requestId }, "spam check unavailable");
    next();
  }
}
