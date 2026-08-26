import Redis from "ioredis";
import logger from "../utils/logger.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    if (times > 5) return null;
    return Math.min(times * 200, 3000);
  },
  lazyConnect: true,
});

let loggedFirstError = false;
redis.on("error", (err) => {
  if (!loggedFirstError) {
    logger.error({ err }, "Redis connection error");
    loggedFirstError = true;
  }
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

// ====================== CACHE HELPERS ======================

const PREFIX = "cache:";

export const cacheGet = async (key) => {
  try {
    const raw = await redis.get(`${PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const cacheSet = async (key, value, ttlSeconds = 60) => {
  try {
    await redis.set(`${PREFIX}${key}`, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Cache write failure is non-critical
  }
};

export const cacheDelPattern = async (pattern) => {
  try {
    const keys = await redis.keys(`${PREFIX}${pattern}`);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Non-critical
  }
};

// ====================== IDEMPOTENCY HELPERS ======================

const IDEMPOTENCY_PREFIX = "idemp:";
const IDEMPOTENCY_TTL = 86400; // 24 hours

export const idempotencyGet = async (key) => {
  try {
    const raw = await redis.get(`${IDEMPOTENCY_PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const idempotencySet = async (key, value) => {
  try {
    await redis.set(`${IDEMPOTENCY_PREFIX}${key}`, JSON.stringify(value), "EX", IDEMPOTENCY_TTL);
    return true;
  } catch {
    return false;
  }
};

// ====================== NOTIFICATION COUNT CACHE ======================

const UNREAD_PREFIX = "unread:";

export const getUnreadCount = async (userId) => {
  try {
    const count = await redis.get(`${UNREAD_PREFIX}${userId}`);
    return count !== null ? parseInt(count, 10) : null;
  } catch {
    return null;
  }
};

export const setUnreadCount = async (userId, count) => {
  try {
    await redis.set(`${UNREAD_PREFIX}${userId}`, count, "EX", 300); // 5min TTL
  } catch {
    // Non-critical
  }
};

export const invalidateUnreadCount = async (userId) => {
  try {
    await redis.del(`${UNREAD_PREFIX}${userId}`);
  } catch {
    // Non-critical
  }
};
