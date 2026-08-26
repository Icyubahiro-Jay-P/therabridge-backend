// ============================================================================
// ERROR TAXONOMY
//
// Every error belongs to exactly one of two audiences:
//
//   USER  - the end user did something through normal app use and needs to
//           know the outcome: invalid input, expired code, edit limit hit,
//           missing resource they own. The message is written FOR THEM, is
//           always safe to display verbatim, in any environment.
//
//   SERVER - something broke that the user cannot fix or understand: a bug,
//           a dead database, a failed upstream call. Raw internals (stacks,
//           driver messages, hostnames) are developer information. They are
//           logged in full server-side; end users only ever see a generic
//           message plus the request id from X-Request-Id.
//
// NODE_ENV drives how much of this reaches the wire:
//   development - SERVER errors include the original message and stack so
//                 developers can debug straight from the response.
//   production  - SERVER errors are sanitized down to the generic message.
//
// Use UserError for anything the user caused or must act on. Everything
// else should simply be thrown and let the central errorHandler classify it.
// ============================================================================

export const ERROR_CATEGORY = Object.freeze({
  USER: "USER",
  SERVER: "SERVER",
});

export class AppError extends Error {
  constructor(message, { statusCode = 500, code = "INTERNAL_ERROR", category = ERROR_CATEGORY.SERVER, details } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.category = category;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/** An outcome caused by (or communicated to) the end user. Safe to show as-is. */
export class UserError extends AppError {
  constructor(message, { statusCode = 400, code = "BAD_REQUEST", details } = {}) {
    if (statusCode >= 500) {
      throw new TypeError("UserError requires a 4xx statusCode");
    }
    super(message, { statusCode, code, category: ERROR_CATEGORY.USER, details });
  }
}

/** An internal failure. Never shown verbatim to end users in production. */
export class ServerError extends AppError {
  constructor(message = "Internal server error", { code = "INTERNAL_ERROR", details } = {}) {
    super(message, { statusCode: 500, code, category: ERROR_CATEGORY.SERVER, details });
  }
}

export default AppError;
