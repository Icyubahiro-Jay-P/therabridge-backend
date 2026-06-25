import express from "express";
import {
  sendMessage,
  getConversation,
  getMyConversations,
  searchUsers,
  createCommunity,
  joinCommunity,
  getMyCommunities,
  getCommunityMessages,
  sendCommunityMessage,
  updateCommunity,
  removeMember,
  getCommunityByKey,
  markCommunityMessagesRead,
  deleteAllMyMessages,
  deleteAllMyCommunityMessages,
  unsendMessage,
  editMessage,
  deleteCommunity,
  getChatSettings,
  updateChatSettings,
} from "../controllers/chat.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

// All chat routes require authentication
router.use(authMiddleware);

// ====================== DIRECT MESSAGES ======================
router.get("/conversations", getMyConversations);
router.get("/conversation/:userId", getConversation);
router.post("/send", sendMessage);
router.get("/search", searchUsers);
router.get("/settings", getChatSettings);
router.put("/settings", updateChatSettings);

// ====================== COMMUNITY ROOMS ======================
router.get("/communities", getMyCommunities);
router.post("/communities", createCommunity);
router.post("/communities/join", joinCommunity);
router.get("/communities/:communityId", getCommunityMessages);
router.get("/communities/by-key/:inviteKey", getCommunityByKey);
router.put("/communities/:communityId", updateCommunity);
router.post("/communities/:communityId/messages", sendCommunityMessage);
router.post("/communities/:communityId/read", markCommunityMessagesRead);
router.post("/communities/:communityId/members/remove", removeMember);
router.delete("/communities/:communityId", deleteCommunity);

router.delete("/messages", deleteAllMyMessages);
router.delete("/community-messages", deleteAllMyCommunityMessages);
router.put("/edit/:messageId", editMessage);
router.delete("/unsend/:messageId", unsendMessage);

export default router;
