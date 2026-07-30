import crypto from "crypto"
import logger from "../utils/logger.js"

const memoryStore = new Map()

const CLEANUP_INTERVAL = 60 * 60 * 1000
const TTL = 24 * 60 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt <= now) memoryStore.delete(key)
  }
}, CLEANUP_INTERVAL)

function hashBody(body) {
  return crypto.createHash("sha256").update(JSON.stringify(body || {})).digest("hex")
}

function getStoreKey(req, key) {
  const userId = req.user?.id || `anon:${req.ip}`
  return `${userId}:${key}`
}

export const idempotencyMiddleware = (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next()

  const idempotencyKey = req.headers["idempotency-key"]
  if (!idempotencyKey) return next()

  const storeKey = getStoreKey(req, idempotencyKey)
  const requestHash = hashBody(req.body)

  const existing = memoryStore.get(storeKey)
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

  memoryStore.set(storeKey, {
    requestHash,
    status: "processing",
    expiresAt: Date.now() + TTL,
  })

  const originalJson = res.json.bind(res)
  res.json = function (data) {
    memoryStore.set(storeKey, {
      requestHash,
      statusCode: res.statusCode,
      data,
      status: "completed",
      expiresAt: Date.now() + TTL,
    })

    return originalJson(data)
  }

  res.on("finish", () => {
    const entry = memoryStore.get(storeKey)
    if (entry && entry.status === "processing") {
      memoryStore.delete(storeKey)
    }
  })

  next()
}

export const clearIdempotencyCache = () => {
  memoryStore.clear()
}
