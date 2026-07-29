import { checkSpam } from "../services/mlClient.js";

export async function spamFilter(req, res, next) {
  const content = req.body?.content || req.body?.message || "";

  if (!content || content.trim() === "") {
    return next();
  }

  try {
    const result = await checkSpam(content);

    if (result.is_spam) {
      return res.status(400).json({
        message: "Message flagged as spam and was not sent.",
        spam_score: result.spam_score,
      });
    }

    req.body._legacy_classification = result;
    next();
  } catch {
    next();
  }
}
