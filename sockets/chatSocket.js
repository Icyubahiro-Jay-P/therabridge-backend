import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { Message } from "../models/chat.model.js";
import logger from "../utils/logger.js";

// ====================== RATE LIMITING ======================
// Possible-screenshot notices are noisy by nature (tab switches, shortcut
// presses), so each user is limited to one notice per 10 seconds.
const NOTICE_RATE_LIMIT_MS = 10_000;
const noticeCooldowns = new Map();

const isRateLimited = (userId) => {
  const now = Date.now();
  const last = noticeCooldowns.get(userId) ?? 0;
  if (now - last < NOTICE_RATE_LIMIT_MS) return true;
  noticeCooldowns.set(userId, now);
  return false;
};

// ====================== CORS (mirrors server.js) ======================
const getSocketCors = () => {
  const allowed = [
    process.env.CLIENT_URL || "http://localhost:5173",
    "https://therabridge.vercel.app",
  ].filter(Boolean);
  return {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      return callback(new Error("CORS policy: Origin not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST"],
  };
};

// ====================== AUTH HANDSHAKE ======================
const extractToken = (handshake) => {
  if (handshake.auth?.token) return handshake.auth.token;
  const auth = handshake.headers?.authorization;
  if (auth?.startsWith("Bearer ")) return auth.split(" ")[1];
  const cookie = handshake.headers?.cookie || "";
  const match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
  return match?.[1] || null;
};

let ioInstance = null;

export const getSocketIO = () => ioInstance;

export const emitToUser = (userId, event, payload) => {
  ioInstance?.to(`user:${userId}`).emit(event, payload);
};

export const emitToCommunity = (communityId, event, payload) => {
  ioInstance?.to(`community:${communityId}`).emit(event, payload);
};

// True when the user has at least one live socket (i.e. the site is open).
// Used to avoid pushing device notifications to users who will already get the
// in-app event in real time.
export const hasActiveConnection = (userId) => {
  if (!ioInstance) return false;
  const room = ioInstance.sockets.adapter.rooms.get(`user:${userId}`);
  return !!room && room.size > 0;
};

// Shared by the socket handler and the REST fallback so both paths persist a
// notice message (paper trail + in-thread system message) and push it to the
// peer's open sockets in real time.
export const recordPossibleScreenshot = async ({
  initiatorId,
  initiatorName,
  peerId,
}) => {
  if (isRateLimited(initiatorId)) {
    return { limited: true };
  }
  if (!peerId || peerId === initiatorId) {
    return { invalid: true };
  }

  const peer = await User.findById(peerId).select("_id");
  if (!peer) return { invalid: true };

  const message = new Message({
    sender: initiatorId,
    recipient: peerId,
    kind: "screenshot-notice",
    noticeType: "possible_screenshot",
    content: `${initiatorName} took a screenshot`,
  });
  await message.save();

  const notice = {
    type: "possible_screenshot",
    messageId: message._id.toString(),
    initiatorId,
    initiatorName,
    conversationId: peerId,
    timestamp: message.createdAt.toISOString(),
  };
  ioInstance?.to(`user:${peerId}`).emit("possible_screenshot", notice);

  return { notice };
};

export const initChatSocket = (server) => {
  const io = new Server(server, { cors: getSocketCors() });
  ioInstance = io;

  io.use(async (socket, next) => {
    try {
      const token = extractToken(socket.handshake);
      if (!token) return next(new Error("unauthorized"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select(
        "isDisabled role username firstName lastName",
      );
      if (!user) return next(new Error("unauthorized"));
      if (user.isDisabled) return next(new Error("disabled"));

      socket.data.user = {
        id: decoded.id,
        role: user.role,
        username: user.username,
        displayName: user.firstName || user.username,
      };
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const { id, displayName } = socket.data.user;
    socket.join(`user:${id}`);
    logger.info({ userId: id }, "socket connected");

    socket.on(
      "possible_screenshot",
      async ({ conversationId } = {}) => {
        try {
          await recordPossibleScreenshot({
            initiatorId: id,
            initiatorName: displayName,
            peerId: conversationId,
          });
        } catch (err) {
          logger.error({ err }, "failed to record possible-screenshot notice");
        }
      },
    );

    // Community rooms: the client joins rooms for the communities it's
    // currently viewing so real-time message pushes can target them.
    socket.on("join_community", ({ communityId } = {}) => {
      if (communityId) socket.join(`community:${communityId}`);
    });

    socket.on("leave_community", ({ communityId } = {}) => {
      if (communityId) socket.leave(`community:${communityId}`);
    });

    socket.on("disconnect", () => {
      logger.info({ userId: id }, "socket disconnected");
    });
  });

  return io;
};
