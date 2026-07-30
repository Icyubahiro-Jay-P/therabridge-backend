import express from "express";
import {
  sendMessage,
  getConversation,
  getConversationUpdates,
  getMyConversations,
  searchUsers,
  createCommunity,
  joinCommunity,
  getMyCommunities,
  getCommunityMessages,
  getCommunityUpdates,
  sendCommunityMessage,
  updateCommunity,
  removeMember,
  getCommunityByKey,
  markCommunityMessagesRead,
  deleteAllMyMessages,
  deleteAllMyCommunityMessages,
  unsendMessage,
  editMessage,
  editCommunityMessage,
  unsendCommunityMessage,
  deleteCommunity,
  getChatSettings,
  updateChatSettings,
} from "../controllers/chat.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { spamFilter } from "../middleware/spamFilter.js";
import { validate, chatSettingsSchema, createCommunitySchema, editMessageSchema } from "../utils/validation.js";

const router = express.Router();

router.use(authMiddleware);

// ====================== DIRECT MESSAGES ======================
router.get("/conversations", getMyConversations);
router.get("/conversation/:userId", getConversation);
router.get("/conversation/:userId/updates", getConversationUpdates);
router.post("/send", spamFilter, sendMessage);
router.get("/search", searchUsers);
router.get("/settings", getChatSettings);
router.put("/settings", validate(chatSettingsSchema), updateChatSettings);

// ====================== COMMUNITY ROOMS ======================
router.get("/communities", getMyCommunities);
router.post("/communities", validate(createCommunitySchema), createCommunity);
router.post("/communities/join", joinCommunity);
router.get("/communities/by-key/:inviteKey", getCommunityByKey);
router.get("/communities/:communityId", getCommunityMessages);
router.get("/communities/:communityId/updates", getCommunityUpdates);
router.put("/communities/:communityId", updateCommunity);
router.post("/communities/:communityId/messages", spamFilter, sendCommunityMessage);
router.put("/communities/:communityId/messages/:messageId", editCommunityMessage);
router.delete("/communities/:communityId/messages/:messageId", unsendCommunityMessage);
router.post("/communities/:communityId/read", markCommunityMessagesRead);
router.post("/communities/:communityId/members/remove", removeMember);
router.delete("/communities/:communityId", deleteCommunity);

router.delete("/messages", deleteAllMyMessages);
router.delete("/community-messages", deleteAllMyCommunityMessages);
router.put("/edit/:messageId", validate(editMessageSchema), editMessage);
router.delete("/unsend/:messageId", unsendMessage);

export default router;
