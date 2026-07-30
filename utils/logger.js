import pino from "pino"

const isProduction = process.env.NODE_ENV === "production"

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  transport: isProduction
    ? undefined
    : { target: "pino/file", options: { destination: 1 } },
  redact: ["req.headers.authorization", "req.headers.cookie", "body.password", "body.currentPassword", "body.newPassword"],
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      requestId: req.requestId,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },
})

export default logger
