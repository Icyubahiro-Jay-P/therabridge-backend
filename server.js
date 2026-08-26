import express from "express";
import http from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import "./utils/validateEnv.js";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import { connectDB } from "./db/connectDB.js";
import { initChatSocket } from "./sockets/chatSocket.js";
import { redis } from "./services/cache.js";
import userRoutes from "./routes/user.route.js";
import exerciseRoutes from "./routes/exercise.route.js";
import chatRoutes from "./routes/chat.route.js";
import notificationRoutes from "./routes/notification.route.js";
import moodRoutes from "./routes/mood.route.js";
import crisisRoutes from "./routes/crisis.route.js";
import therryRoutes from "./routes/therry.route.js";
import safetyPlanRoutes from "./routes/safetyPlan.route.js";
import therapistRoutes from "./routes/therapist.route.js";
import pushRoutes from "./routes/push.route.js";
import auditRoutes from "./routes/audit.route.js";
import adminRoutes from "./routes/admin.route.js";
import journalRoutes from "./routes/journal.route.js";
import thoughtRecordRoutes from "./routes/thoughtRecord.route.js";
import assessmentRoutes from "./routes/assessment.route.js";
import gratitudeRoutes from "./routes/gratitude.route.js";
import activityRoutes from "./routes/activity.route.js"
import copingCardRoutes from "./routes/copingCard.route.js";
import psychoedRoutes from "./routes/psychoedModule.route.js";
import programRoutes from "./routes/program.route.js";
import recommendationRoutes from "./routes/recommendation.route.js";
import sleepRoutes from "./routes/sleep.route.js";
import medicationRoutes from "./routes/medication.route.js";
import petRoutes from "./routes/pet.route.js";
import habitRoutes from "./routes/habit.route.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/error.middleware.js";
import { idempotencyMiddleware } from "./middleware/idempotency.js";
import { scheduleRetentionPurge } from "./services/queue.js";
import logger from "./utils/logger.js";
import RedisStore from "rate-limit-redis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";

// Trust proxy: required behind Render's reverse proxy so
// express-rate-limit can read the real client IP from X-Forwarded-For.
if (isProduction) app.set("trust proxy", 1);

// ====================== SOCKET.IO (real-time notices) ======================
// Wired up before routes so the shared socket reference is ready for any
// controller that needs to push a real-time event.
initChatSocket(server);

// ====================== REQUEST ID + LOGGING ======================
app.use((req, res, next) => {
  req.requestId = uuidv4().slice(0, 8);
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn({ req, duration: `${duration}ms` }, "slow request");
    } else if (res.statusCode >= 400) {
      logger.warn({ req, res, duration: `${duration}ms` }, "request error");
    }
  });
  next();
});

// ====================== SECURITY ======================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-origin" },
    contentSecurityPolicy: false,
  }),
);

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      const allowed = [
        process.env.CLIENT_URL || "http://localhost:5173",
        "https://therabridge.vercel.app",
      ].filter(Boolean);
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      return callback(new Error("CORS policy: Origin not allowed"));
    },
  }),
);

const redisStoreOpts = {
  sendCommand: (...args) => redis.call(...args),
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ ...redisStoreOpts, prefix: "rl:auth:" }),
  message: { error: { message: "Too many attempts, try again later", code: "RATE_LIMITED" } },
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ ...redisStoreOpts, prefix: "rl:pwd:" }),
  message: { error: { message: "Too many password reset attempts, try again later", code: "RATE_LIMITED" } },
});

const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ ...redisStoreOpts, prefix: "rl:2fa:" }),
  message: { error: { message: "Too many two-factor attempts, try again later", code: "RATE_LIMITED" } },
});

const crisisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ ...redisStoreOpts, prefix: "rl:crisis:" }),
  message: { error: { message: "Too many alerts, please contact your therapist directly", code: "RATE_LIMITED" } },
});

// Long-poll + layout polling endpoints run frequently (every ~10s), so they
// are exempt from the general limiter to avoid tripping it during normal use.
const skipFrequentPolling = (req) => /\/updates$/.test(req.path);

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipFrequentPolling,
  store: new RedisStore({ ...redisStoreOpts, prefix: "rl:general:" }),
  message: { error: { message: "Too many requests, try again later", code: "RATE_LIMITED" } },
});

app.use(generalLimiter);

// ====================== PARSING ======================
// JSON body parsing is mounted per-router with route-tuned size limits (see
// middleware/jsonBody.js). No global parser: a single app-wide limit would
// either reject legitimate large payloads or under-protect small ones.
app.use(cookieParser());

// ====================== IDEMPOTENCY ======================
app.use(idempotencyMiddleware);

// ====================== STATIC FILES ======================
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ====================== ROUTES ======================
// Auth routes get a stricter limiter registered before the user routes so
// it actually matches (middleware runs in registration order).
app.use("/api/users/login", authLimiter);
app.use("/api/users/register", authLimiter);
app.use("/api/users/verify-email", authLimiter);
app.use("/api/users/resend-verification", authLimiter);
app.use("/api/users/forgot-password", passwordResetLimiter);
app.use("/api/users/reset-password", passwordResetLimiter);
app.use("/api/users/2fa/validate", twoFactorLimiter);

app.use("/api/users", userRoutes);
app.use("/api/exercises", exerciseRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/mood", moodRoutes);
app.use("/api/crisis", crisisLimiter);
app.use("/api/crisis", crisisRoutes);
app.use("/api/therry", therryRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/safety-plan", safetyPlanRoutes);
app.use("/api/therapist", therapistRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/journal", journalRoutes);
app.use("/api/thought-records", thoughtRecordRoutes);
app.use("/api/assessments", assessmentRoutes);
app.use("/api/gratitude", gratitudeRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/coping-cards", copingCardRoutes);
app.use("/api/psychoed", psychoedRoutes);
app.use("/api/programs", programRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/sleep", sleepRoutes);
app.use("/api/medications", medicationRoutes);
app.use("/api/pet", petRoutes);
app.use("/api/habits", habitRoutes);

// ====================== HEALTH CHECK ======================
app.get("/health", async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const dbStatus = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
    const redisStatus = redis.status === "ready" ? "connected" : redis.status;

    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      database: dbStatus[dbState] || "unknown",
      redis: redisStatus,
    });
  } catch {
    res.status(503).json({ status: "error", message: "Health check failed" });
  }
});

app.get("/", (req, res) => {
  res.status(200).json({ message: "Therabridge API is running!" });
});

// ====================== ERROR HANDLING ======================
app.use(notFoundHandler);
app.use(errorHandler);

// ====================== START SERVER ======================
const serverInstance = { httpServer: null, dbClosed: false };

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  process.exit(1);
});

const shutdown = (signal) => {
  logger.info({ signal }, "Shutting down gracefully");
  if (!serverInstance.httpServer) return;
  serverInstance.httpServer.close(async () => {
    if (serverInstance.dbClosed) return;
    serverInstance.dbClosed = true;
    try {
      await redis.quit();
      logger.info("Redis disconnected");
    } catch {
      // Redis may already be disconnected
    }
    mongoose
      .disconnect()
      .then(() => {
        logger.info("Database disconnected");
        process.exit(0);
      })
      .catch((err) => {
        logger.error({ err }, "Error disconnecting database");
        process.exit(1);
      });
  });
  setTimeout(() => {
    logger.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

connectDB()
  .then(() => {
    serverInstance.httpServer = server.listen(PORT, () => {
      logger.info({ port: PORT }, "Therabridge server started");
    });
  })
  .catch((err) => {
    logger.fatal({ err }, "Failed to connect to database");
    process.exit(1);
  });
