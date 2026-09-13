import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { Message, Community } from "../models/chat.model.js";
import { encryptField } from "../utils/crypto.js";
import { redis } from "../services/cache.js";
import logger from "../utils/logger.js";
import { recordLegacyScreenshotEvent } from "../services/screenshotEvent.service.js";
import allowedOrigins from "../config/allowedOrigins.js";

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

// ====================== CORS ======================
const getSocketCors = () => ({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS policy: Origin not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST"],
});

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

export const emitToUser = (userId, event, payload) => {
  ioInstance?.to(`user:${userId}`).emit(event, payload);
};

export const emitToCommunity = (communityId, event, payload) => {
  ioInstance?.to(`community:${communityId}`).emit(event, payload);
};

// Force any of a removed member's live sockets out of a community's room so
// they stop receiving that room's broadcasts immediately, rather than
// relying on their (untrusted) client to voluntarily leave.
export const evictUserFromCommunity = (userId, communityId) => {
  ioInstance?.in(`user:${userId}`).socketsLeave(`community:${communityId}`);
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

  // Only allow the notice against a real, existing conversation so a user
  // can't spam unsolicited screenshot alerts at arbitrary accounts.
  const hasConversation = await Message.exists({
    $or: [
      { sender: initiatorId, recipient: peerId },
      { sender: peerId, recipient: initiatorId },
    ],
  });
  if (!hasConversation) return { invalid: true };

  const message = new Message({
    sender: initiatorId,
    recipient: peerId,
    kind: "screenshot-notice",
    noticeType: "possible_screenshot",
    content: encryptField(`${initiatorName} took a screenshot`),
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

  // Best-effort paper trail into the new ScreenshotEvent collection so
  // web-heuristic captures are auditable alongside session-gated events.
  // Never blocks or changes the existing real-time flow.
  recordLegacyScreenshotEvent({ actorId: initiatorId, peerId })
    .catch((err) => logger.error({ err }, "legacy screenshot event record failed"));

  return { notice };
};

// ====================== WEBRTC CALL STATE ======================
// Tracks which two users are in a given call (by callId) and a per-user
// "busy" flag. Backed by Redis when available so any server instance can
// service any call's signaling events - the same reason the Redis adapter
// is attached above. Falls back to a local Map when Redis isn't connected,
// so calling still works on a single instance without Redis (Redis is
// optional everywhere else in this app; call signaling shouldn't be the one
// place that hard-depends on it).
const RING_TIMEOUT_MS = 30_000;
const RINGING_TTL_SEC = Math.ceil(RING_TIMEOUT_MS / 1000) + 10;
// Once answered, the record is kept around (well past any plausible call
// duration) purely as a safety net for a crashed instance; call:end and
// disconnect delete it explicitly the moment a call actually ends.
const CONNECTED_TTL_SEC = 6 * 60 * 60;

const localCalls = new Map(); // callId -> { callerId, calleeId }
const localBusy = new Map(); // userId -> callId
const callTimers = new Map(); // callId -> setTimeout handle (this instance only, best-effort)

const redisReady = () => redis.status === "ready";

async function getCall(callId) {
  if (redisReady()) {
    try {
      const raw = await redis.get(`call:active:${callId}`);
      if (raw) return JSON.parse(raw);
    } catch (err) {
      logger.warn({ err, callId }, "redis getCall failed, falling back to local state");
    }
  }
  return localCalls.get(callId) ?? null;
}

async function getUserCallId(userId) {
  if (redisReady()) {
    try {
      const callId = await redis.get(`call:busy:${userId}`);
      if (callId) return callId;
    } catch (err) {
      logger.warn({ err, userId }, "redis getUserCallId failed, falling back to local state");
    }
  }
  return localBusy.get(userId) ?? null;
}

async function saveCall(callId, callerId, calleeId, ttlSeconds) {
  localCalls.set(callId, { callerId, calleeId });
  localBusy.set(callerId, callId);
  localBusy.set(calleeId, callId);
  if (redisReady()) {
    try {
      await Promise.all([
        redis.set(`call:active:${callId}`, JSON.stringify({ callerId, calleeId }), "EX", ttlSeconds),
        redis.set(`call:busy:${callerId}`, callId, "EX", ttlSeconds),
        redis.set(`call:busy:${calleeId}`, callId, "EX", ttlSeconds),
      ]);
    } catch (err) {
      logger.warn({ err, callId }, "redis saveCall failed, relying on local state");
    }
  }
}

async function deleteCall(callId, callerId, calleeId) {
  const timer = callTimers.get(callId);
  if (timer) {
    clearTimeout(timer);
    callTimers.delete(callId);
  }
  localCalls.delete(callId);
  localBusy.delete(callerId);
  localBusy.delete(calleeId);
  if (redisReady()) {
    try {
      await Promise.all([
        redis.del(`call:active:${callId}`),
        redis.del(`call:busy:${callerId}`),
        redis.del(`call:busy:${calleeId}`),
      ]);
    } catch (err) {
      logger.warn({ err, callId }, "redis deleteCall failed - the TTL will expire it eventually");
    }
  }
}

async function createMissedCallMessage(callerId, calleeId) {
  try {
    const caller = await User.findById(callerId).select("firstName username");
    const callee = await User.findById(calleeId).select("_id");
    if (!caller || !callee) return;

    const message = new Message({
      sender: callerId,
      recipient: calleeId,
      kind: "missed-call",
      content: encryptField("Missed call"),
    });
    await message.save();

    const senderObj = {
      _id: caller._id.toString(),
      username: caller.username,
      firstName: caller.firstName,
      lastName: "",
    };
    const recipientObj = {
      _id: callee._id.toString(),
      username: "",
      firstName: "",
      lastName: "",
    };

    const payload = {
      _id: message._id.toString(),
      sender: senderObj,
      recipient: recipientObj,
      content: "Missed call",
      read: false,
      createdAt: message.createdAt.toISOString(),
      kind: "missed-call",
    };

    ioInstance?.to(`user:${callerId}`).emit("dm_message", payload);
    ioInstance?.to(`user:${calleeId}`).emit("dm_message", payload);
  } catch (err) {
    logger.error({ err }, "failed to create missed call message");
  }
}

export const initChatSocket = (server) => {
  const io = new Server(server, { cors: getSocketCors() });
  ioInstance = io;

  // Attach Redis adapter for cross-instance pub/sub when Redis is available
  if (redis.status === "ready") {
    try {
      const pubClient = redis.duplicate();
      const subClient = redis.duplicate();
      io.adapter(createAdapter(pubClient, subClient));
      logger.info("Socket.IO Redis adapter attached");
    } catch (err) {
      logger.warn({ err }, "Socket.IO Redis adapter failed — running without cross-instance sync");
    }
  }

  io.use(async (socket, next) => {
    try {
      const token = extractToken(socket.handshake);
      if (!token) return next(new Error("unauthorized"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select(
        "isDisabled role username firstName lastName avatar",
      );
      if (!user) return next(new Error("unauthorized"));
      if (user.isDisabled) return next(new Error("disabled"));

      socket.data.user = {
        id: decoded.id,
        role: user.role,
        username: user.username,
        displayName: user.firstName || user.username,
        avatar: user.avatar || null,
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
    // Membership is verified server-side before the join so a user can't
    // subscribe to a room for a community they don't belong to by guessing
    // its ObjectId.
    socket.on("join_community", async ({ communityId } = {}) => {
      if (!communityId || typeof communityId !== "string") return;
      try {
        const { id, role } = socket.data.user;
        if (role === "admin") {
          socket.join(`community:${communityId}`);
          return;
        }
        const isMember = await Community.exists({
          _id: communityId,
          members: id,
        });
        if (isMember) {
          socket.join(`community:${communityId}`);
        } else {
          socket.leave(`community:${communityId}`);
        }
      } catch (err) {
        logger.warn(
          { err, userId: socket.data.user?.id },
          "failed to verify community membership on join",
        );
      }
    });

    socket.on("leave_community", ({ communityId } = {}) => {
      if (communityId) socket.leave(`community:${communityId}`);
    });

    // ====================== WEBRTC SIGNALING ======================
    socket.on("call:initiate", async ({ calleeId } = {}) => {
      if (!calleeId || calleeId === id) return;

      if (await getUserCallId(calleeId)) {
        socket.emit("call:busy", { calleeId });
        return;
      }
      if (await getUserCallId(id)) {
        socket.emit("call:busy", { calleeId });
        return;
      }

      const callId = `call_${id}_${calleeId}_${Date.now()}`;
      await saveCall(callId, id, calleeId, RINGING_TTL_SEC);

      const timer = setTimeout(async () => {
        // Skip if the call was already answered/rejected/ended elsewhere
        // (possibly on a different instance) by the time this fires.
        const stillRinging = await getCall(callId);
        if (!stillRinging) return;
        await deleteCall(callId, id, calleeId);
        io.to(`user:${id}`).emit("call:missed", { callId });
        io.to(`user:${calleeId}`).emit("call:ended", { callId, endedBy: id });
        await createMissedCallMessage(id, calleeId);
      }, RING_TIMEOUT_MS);
      callTimers.set(callId, timer);

      io.to(`user:${calleeId}`).emit("call:incoming", {
        callId,
        callerId: id,
        callerName: socket.data.user.displayName,
        callerUsername: socket.data.user.username,
        callerAvatar: socket.data.user.avatar || null,
      });

      socket.emit("call:initiated", { callId, calleeId });
    });

    socket.on("call:offer", async ({ callId, sdp, calleeId } = {}) => {
      const call = await getCall(callId);
      if (!call || call.callerId !== id || call.calleeId !== calleeId) return;
      io.to(`user:${calleeId}`).emit("call:offer", {
        callId,
        sdp,
        callerId: id,
      });
    });

    socket.on("call:answer", async ({ callId, sdp, callerId } = {}) => {
      const call = await getCall(callId);
      if (!call || call.calleeId !== id) return;
      // Extend the record's TTL now that the call is connected - it's still
      // needed for ICE-candidate validation for the call's duration, and
      // call:end/disconnect delete it explicitly when the call actually ends.
      await saveCall(callId, call.callerId, call.calleeId, CONNECTED_TTL_SEC);
      io.to(`user:${callerId}`).emit("call:answer", {
        callId,
        sdp,
        calleeId: id,
      });
    });

    socket.on("call:ice-candidate", async ({ callId, candidate, targetId } = {}) => {
      const call = await getCall(callId);
      if (!call) return;
      const isParticipant = call.callerId === id || call.calleeId === id;
      const validTarget =
        (call.callerId === id && call.calleeId === targetId) ||
        (call.calleeId === id && call.callerId === targetId);
      if (!isParticipant || !validTarget) return;
      io.to(`user:${targetId}`).emit("call:ice-candidate", {
        callId,
        candidate,
        fromId: id,
      });
    });

    socket.on("call:end", async ({ callId } = {}) => {
      const call = await getCall(callId);
      if (!call) return;
      if (call.callerId !== id && call.calleeId !== id) return;
      const peerId =
        call.callerId === id ? call.calleeId : call.callerId;
      await deleteCall(callId, call.callerId, call.calleeId);
      io.to(`user:${peerId}`).emit("call:ended", { callId, endedBy: id });
    });

    socket.on("call:reject", async ({ callId } = {}) => {
      const call = await getCall(callId);
      if (!call || call.calleeId !== id) return;
      await deleteCall(callId, call.callerId, call.calleeId);
      io.to(`user:${call.callerId}`).emit("call:rejected", {
        callId,
        calleeId: id,
      });
    });

    socket.on("disconnect", async () => {
      try {
        const callId = await getUserCallId(id);
        if (callId) {
          const call = await getCall(callId);
          if (call) {
            const peerId = call.callerId === id ? call.calleeId : call.callerId;
            await deleteCall(callId, call.callerId, call.calleeId);
            io.to(`user:${peerId}`).emit("call:ended", { callId, endedBy: id });
          }
        }
      } catch (err) {
        logger.error({ err, userId: id }, "failed to clean up call on disconnect");
      }
      logger.info({ userId: id }, "socket disconnected");
    });
  });

  return io;
};
