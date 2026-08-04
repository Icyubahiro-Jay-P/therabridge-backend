import express from "express";
import http from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { connectDB } from "./db/connectDB.js";
import { initChatSocket } from "./sockets/chatSocket.js";
import userRoutes from "./routes/user.route.js";
import exerciseRoutes from "./routes/exercise.route.js";
import chatRoutes from "./routes/chat.route.js";
import notificationRoutes from "./routes/notification.route.js";
import moodRoutes from "./routes/mood.route.js";
import crisisRoutes from "./routes/crisis.route.js";
import therryRoutes from "./routes/therry.route.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/error.middleware.js";
import { idempotencyMiddleware } from "./middleware/idempotency.js";
import logger from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";

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
    crossOriginResourcePolicy: { policy: "cross-origin" },
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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many attempts, try again later", code: "RATE_LIMITED" } },
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many password reset attempts, try again later", code: "RATE_LIMITED" } },
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
  message: { error: { message: "Too many requests, try again later", code: "RATE_LIMITED" } },
});

app.use(generalLimiter);

// ====================== PARSING ======================
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// ====================== IDEMPOTENCY ======================
app.use(idempotencyMiddleware);

// ====================== STATIC FILES ======================
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ====================== ROUTES ======================
// Auth routes get a stricter limiter — registered before the user routes so
// it actually matches (middleware runs in registration order).
app.use("/api/users/login", authLimiter);
app.use("/api/users/register", authLimiter);
app.use("/api/users/forgot-password", passwordResetLimiter);
app.use("/api/users/reset-password", passwordResetLimiter);

app.use("/api/users", userRoutes);
app.use("/api/exercises", exerciseRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/mood", moodRoutes);
app.use("/api/crisis", crisisRoutes);
app.use("/api/therry", therryRoutes);

// ====================== HEALTH CHECK ======================
app.get("/health", async (req, res) => {
  try {
    const mongoose = (await import("mongoose")).default;
    const dbState = mongoose.connection.readyState;
    const dbStatus = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };

    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      database: dbStatus[dbState] || "unknown",
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
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      logger.info({ port: PORT }, "Therabridge server started");
    });
  })
  .catch((err) => {
    logger.fatal({ err }, "Failed to connect to database");
    process.exit(1);
  });
