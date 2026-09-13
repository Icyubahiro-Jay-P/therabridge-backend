import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redis } from "../services/cache.js";

// Route-level (not server.js app.use) limiters, since the message-send and
// Therry-chat endpoints live under path prefixes (/api/chat, /api/therry)
// that are also used for unrelated GET traffic a blanket prefix-level
// limiter would incorrectly throttle. `limiters` is a shared mutable holder
// so server.js can swap the in-memory store for Redis once it connects
// (mirroring createLimiters' own pattern) without a circular import between
// server.js and the route files that apply these.
export const limiters = {};

const perUserKey = (req) => req.user?.id || ipKeyGenerator(req.ip);

export function createMessageLimiters(useRedis) {
  const storeOpts = useRedis
    ? { sendCommand: (...args) => redis.call(...args) }
    : undefined;
  const makeStore = (prefix) => (useRedis ? new RedisStore({ ...storeOpts, prefix }) : undefined);

  limiters.messageLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: perUserKey,
    store: makeStore("rl:msg:"),
    message: { error: { message: "You're sending messages too quickly. Please slow down.", code: "RATE_LIMITED" } },
  });

  limiters.therryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: perUserKey,
    store: makeStore("rl:therry:"),
    message: { error: { message: "Too many messages to Therry, please try again later.", code: "RATE_LIMITED" } },
  });
}

// Safe in-memory defaults so route files always have a working limiter to
// mount at import time, before server.js decides whether Redis is available.
createMessageLimiters(false);

export const messageLimiter = (req, res, next) => limiters.messageLimiter(req, res, next);
export const therryLimiter = (req, res, next) => limiters.therryLimiter(req, res, next);
