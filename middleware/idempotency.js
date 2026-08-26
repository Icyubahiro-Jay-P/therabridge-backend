import crypto from "crypto"
import { idempotencyGet, idempotencySet } from "../services/cache.js"
import logger from "../utils/logger.js"

function hashBody(body) {
  return crypto.createHash("sha256").update(JSON.stringify(body || {})).digest("hex")
}

function getStoreKey(req, key) {
  const userId = req.user?.id || `anon:${req.ip}`
  return `${userId}:${key}`
}

export const idempotencyMiddleware = async (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next()

  const idempotencyKey = req.headers["idempotency-key"]
  if (!idempotencyKey) return next()

  const storeKey = getStoreKey(req, idempotencyKey)
  const requestHash = hashBody(req.body)

  try {
    const existing = await idempotencyGet(storeKey)
    if (existing) {
      if (existing.status === "processing") {
        return res.status(425).json({
          error: { message: "Request is already being processed", code: "TOO_EARLY" },
        })
      }

      if (existing.requestHash !== requestHash) {
        return res.status(422).json({
          error: {
            message: "Idempotency key reused with different request body",
            code: "IDEMPOTENCY_KEY_MISMATCH",
          },
        })
      }

      return res.status(existing.statusCode).json(existing.data)
    }

    await idempotencySet(storeKey, {
      requestHash,
      status: "processing",
    })
  } catch {
    // If Redis is down, allow the request through (fail open)
  }

  const originalJson = res.json.bind(res)
  res.json = function (data) {
    idempotencySet(storeKey, {
      requestHash,
      statusCode: res.statusCode,
      data,
      status: "completed",
    }).catch(() => {})

    return originalJson(data)
  }

  next()
}

export const clearIdempotencyCache = () => {
  // No-op: Redis handles its own cleanup via TTL
}
