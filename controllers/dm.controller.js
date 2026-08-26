import { Message } from "../models/chat.model.js";
import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";
import { emitToUser } from "../sockets/chatSocket.js";
import { awardMessagePoints, MESSAGE_POINTS } from "../utils/points.js";
import { withTransaction } from "../utils/transactions.js";
import { createNotification } from "../services/notification.service.js";
import {
  getPaginationParams,
  formatPaginatedResponse,
  getCursorPaginationParams,
  formatCursorPaginatedResponse,
} from "../utils/pagination.js";
import { encryptField, decryptField } from "../utils/crypto.js";
import {
  decryptMessageContent,
  LONG_POLL_INTERVAL_MS,
  LONG_POLL_TIMEOUT_MS,
  INITIAL_CATCHUP_WINDOW_MS,
} from "./chat.utils.js";

export {
  sendMessage,
  editMessage,
  unsendMessage,
  deleteAllMyMessages,
} from "./dmMessaging.controller.js";

export {
  getConversation,
  markConversationRead,
  getConversationUpdates,
  getMyConversations,
} from "./dmConversation.controller.js";

export {
  searchUsers,
  getSuggestedUsers,
} from "./dmUsers.controller.js";
