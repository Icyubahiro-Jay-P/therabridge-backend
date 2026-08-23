import logger from "../utils/logger.js"
import { AppError, ERROR_CATEGORY } from "../utils/appError.js"

// ============================================================================
// CENTRAL ERROR HANDLER
//
// Two audiences, gated by NODE_ENV:
//
//   development - developers get everything: real messages, stack traces and
//                 validation details for every failure, right in the response.
//
//   production  - end users only ever see messages written for them. USER-
//                 category errors pass through verbatim (they are authored
//                 for humans); SERVER-category errors are replaced with a
//                 generic message + the request id, while the full details
//                 are logged server-side for whoever is on call.
//
// Canonical response shape (always):
//   { "error": { "message", "code", "category", "requestId"? } }
// ============================================================================

const isProduction = process.env.NODE_ENV === "production"

const GENERIC_SERVER_MESSAGE = "Something went wrong on our end. Please try again in a moment."

const sendError = (res, statusCode, payload) => {
  res.status(statusCode).json({ error: payload })
}

export const errorHandler = (err, req, res, next) => {
  const requestId = req.requestId

  if (res.headersSent) {
    return next(err)
  }

  // ---- Payload/body-parser protocol errors (user-fixable) ------------------
  if (err.type === "entity.too.large") {
    logger.warn({ requestId, limit: err.limit }, "Payload too large")
    return sendError(res, 413, {
      message: "That upload is too large.",
      code: "PAYLOAD_TOO_LARGE",
      category: ERROR_CATEGORY.USER,
      ...(isProduction ? {} : { requestId }),
    })
  }

  // ---- Known framework/driver errors -> friendly USER errors ---------------
  let error = err

  if (!(error instanceof AppError)) {
    if (err.name === "ValidationError" && err.errors) {
      const messages = Object.values(err.errors).map((e) => e.message)
      logger.warn({ requestId, err }, "Validation error")
      error = new AppError(messages.join("; "), {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        category: ERROR_CATEGORY.USER,
      })
    } else if (err.code === 11000 && err.keyValue) {
      const field = Object.keys(err.keyValue)[0]
      logger.warn({ requestId, field }, "Duplicate key error")
      error = new AppError(`${field} already exists.`, {
        statusCode: 409,
        code: "DUPLICATE_ERROR",
        category: ERROR_CATEGORY.USER,
      })
    } else if (err.name === "CastError") {
      logger.warn({ requestId, err }, "Cast error")
      error = new AppError("That item could not be found.", {
        statusCode: 400,
        code: "CAST_ERROR",
        category: ERROR_CATEGORY.USER,
      })
    } else if (err.name === "ZodError") {
      // Only logged at debug-worthy level; zod issues are developer-facing.
      logger.warn({ requestId }, "Schema validation failed")
      const messages = err.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      error = new AppError(messages.join("; "), {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        category: ERROR_CATEGORY.USER,
      })
    }
  }

  // ---- Classify whatever remains -------------------------------------------
  const statusCode = Number(error.statusCode) || 500
  const isServerError = statusCode >= 500
  const category =
    error.category ?? (isServerError ? ERROR_CATEGORY.SERVER : ERROR_CATEGORY.USER)

  // Log everything server-side with full detail, always.
  const logPayload = { requestId, err: error }
  if (isServerError) {
    logger.error(logPayload, "Internal server error")
  } else {
    logger.warn(logPayload, "Request error")
  }

  // Decide what the client sees.
  let message
  let code
  if (!isProduction && isServerError) {
    // Development: hand the raw failure to whoever is debugging.
    message = error.message || GENERIC_SERVER_MESSAGE
    code = error.code || "INTERNAL_ERROR"
  } else if (isServerError) {
    // Production: internals never leak; users get a calm generic message.
    message = GENERIC_SERVER_MESSAGE
    code = "INTERNAL_ERROR"
  } else {
    // True user errors: authored for the user, safe in every environment.
    message = error.message
    code = error.code || "REQUEST_ERROR"
  }

  return sendError(res, statusCode, {
    message,
    code,
    category,
    ...(requestId ? { requestId } : {}),
    ...(!isProduction && isServerError && error.stack ? { stack: error.stack } : {}),
    ...(!isProduction && error.details !== undefined ? { details: error.details } : {}),
  })
}

export const notFoundHandler = (req, res) => {
  logger.warn(
    { method: req.method, url: req.originalUrl },
    "Route not found",
  )
  res.status(404).json({
    error: {
      message: `Route ${req.originalUrl} not found`,
      code: "NOT_FOUND",
      category: ERROR_CATEGORY.USER,
      ...(req.requestId ? { requestId: req.requestId } : {}),
    },
  })
}
