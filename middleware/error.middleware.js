import logger from "../utils/logger.js"

export const errorHandler = (err, req, res, next) => {
  const requestId = req.requestId

  if (res.headersSent) {
    return next(err)
  }

  if (err.type === "entity.too.large") {
    logger.warn({ requestId, limit: err.limit }, "Payload too large")
    return res.status(413).json({
      error: {
        message: "Request body too large.",
        code: "PAYLOAD_TOO_LARGE",
      },
    })
  }

  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message)
    logger.warn({ requestId, err }, "Validation error")
    return res.status(400).json({
      error: { message: messages.join("; "), code: "VALIDATION_ERROR" },
    })
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0]
    logger.warn({ requestId, field }, "Duplicate key error")
    return res.status(409).json({
      error: { message: `${field} already exists.`, code: "DUPLICATE_ERROR" },
    })
  }

  if (err.name === "CastError") {
    logger.warn({ requestId, err }, "Cast error")
    return res.status(400).json({
      error: { message: "Invalid ID format.", code: "CAST_ERROR" },
    })
  }

  if (err.name === "ZodError") {
    const messages = err.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    )
    return res.status(400).json({
      error: { message: messages.join("; "), code: "VALIDATION_ERROR" },
    })
  }

  const statusCode = err.statusCode || 500
  const isServerError = statusCode >= 500

  if (isServerError) {
    logger.error({ requestId, err }, "Internal server error")
  } else {
    logger.warn({ requestId, err }, "Request error")
  }

  res.status(statusCode).json({
    error: {
      message: isServerError ? "Internal server error" : err.message,
      code: err.code || "INTERNAL_ERROR",
    },
  })
}

export const notFoundHandler = (req, res) => {
  logger.warn({ method: req.method, url: req.originalUrl }, "Route not found")
  res.status(404).json({
    error: { message: `Route ${req.originalUrl} not found`, code: "NOT_FOUND" },
  })
}
