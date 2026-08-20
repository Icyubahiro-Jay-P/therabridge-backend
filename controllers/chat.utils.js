import { decryptField } from "../utils/crypto.js";

export const LONG_POLL_INTERVAL_MS = 1000;
export const LONG_POLL_TIMEOUT_MS = 30000;
export const INITIAL_CATCHUP_WINDOW_MS = 30000;

export const decryptMessageContent = (doc) => {
  if (!doc) return doc;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    ...obj,
    content: decryptField(obj.content),
    editHistory: (obj.editHistory || []).map((h) => ({
      ...h,
      content: decryptField(h.content),
    })),
  };
};

export const decryptCommunityMessageContent = (doc) => {
  if (!doc) return doc;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    ...obj,
    content: decryptField(obj.content),
  };
};

export const canModerate = (community, userId, role) =>
  role === "admin" ||
  community.owner?.toString() === userId ||
  (community.moderators ?? []).some((m) => m?.toString() === userId);
