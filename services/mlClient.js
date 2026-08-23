import logger from "../utils/logger.js";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const TIMEOUT_MS = 2000;

async function fetchPrediction(endpoint, text, requestId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${AI_SERVICE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      // The ML service is optional hardening - degrade gracefully, but leave a
      // trace so outages are visible in the logs instead of silent.
      logger.warn({ endpoint, status: res.status }, "ML service returned an error");
      return null;
    }
    return await res.json();
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      logger.warn({ endpoint }, "ML service timed out");
    } else {
      logger.warn({ err, endpoint }, "ML service unreachable");
    }
    return null;
  }
}

export async function checkSpam(text) {
  const result = await fetchPrediction("/predict/spam", text);
  return result ?? {
    is_spam: false,
    spam_score: 0,
    label: "legitimate",
  };
}

export async function checkCrisis(text) {
  const result = await fetchPrediction("/predict/crisis", text);
  return result ?? null;
}

export async function analyzeSentiment(text) {
  const result = await fetchPrediction("/predict/sentiment", text);
  return result ?? {
    sentiment: "neutral",
    score: { neutral: 1 },
  };
}

export async function analyzeAll(text) {
  const result = await fetchPrediction("/predict/all", text);
  return result ?? null;
}

export async function ping() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${AI_SERVICE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}
