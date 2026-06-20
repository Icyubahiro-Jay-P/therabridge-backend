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

// ====================== COMMUNITY ROOMS ======================
router.get("/communities", getMyCommunities);
router.post("/communities", createCommunity);
router.post("/communities/join", joinCommunity);
router.get("/communities/:communityId", getCommunityMessages);
router.post("/communities/:communityId/messages", sendCommunityMessage);

export default router;
