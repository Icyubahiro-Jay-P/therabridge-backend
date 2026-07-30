/**
 * Idempotency middleware to handle duplicate write requests
 * Stores idempotency keys in memory (for production, use Redis)
 */

const idempotencyStore = new Map(); // In production, use Redis

/**
 * Idempotency middleware for write operations
 * Checks for Idempotency-Key header and prevents duplicate processing
 */
export const idempotencyMiddleware = (req, res, next) => {
  // Only apply to POST, PUT, PATCH, DELETE requests
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  const idempotencyKey = req.headers["idempotency-key"];
  if (!idempotencyKey) {
    // No idempotency key provided - continue normally
    // In production, you might want to require this
    return next();
  }

  // Create a unique identifier combining key + userId
  const userId = req.user?.id || `anon:${req.ip}`;
  const storeKey = `${userId}:${idempotencyKey}`;

  // Check if this request has already been processed
  const cachedResponse = idempotencyStore.get(storeKey);
  if (cachedResponse) {
    // Return the previous response
    return res.status(cachedResponse.statusCode).json(cachedResponse.data);
  }

  // Wrap the original res.json to cache the response
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    // Store the response for future identical requests (TTL: 24 hours)
    const ttl = 24 * 60 * 60 * 1000;
    idempotencyStore.set(storeKey, {
      statusCode: res.statusCode,
      data,
    });

    // Clean up after TTL
    setTimeout(() => idempotencyStore.delete(storeKey), ttl);

    return originalJson(data);
  };

  next();
};

/**
 * Clear idempotency cache (useful for testing)
 */
export const clearIdempotencyCache = () => {
  idempotencyStore.clear();
};
