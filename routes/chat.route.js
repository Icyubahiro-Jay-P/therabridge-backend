import express from "express";
import {
  sendMessage,
  getConversation,
  getConversationUpdates,
  getMyConversations,
  searchUsers,
  getSuggestedUsers,
  createCommunity,
  joinCommunity,
  leaveCommunity,
  getMyCommunities,
  getCommunityMessages,
  getCommunityUpdates,
  sendCommunityMessage,
  updateCommunity,
  removeMember,
  inviteMember,
  getJoinRequests,
  respondToJoinRequest,
  addModerator,
  removeModerator,
  getCommunityByKey,
  markCommunityMessagesRead,
  deleteAllMyMessages,
  deleteAllMyCommunityMessages,
  unsendMessage,
  editMessage,
  editCommunityMessage,
  unsendCommunityMessage,
  deleteCommunity,
  toggleDisableCommunity,
  getChatSettings,
  updateChatSettings,
  reportPossibleScreenshot,
  generateWatermarkStamp,
} from "../controllers/chat.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { spamFilter } from "../middleware/spamFilter.js";
import { validate, chatSettingsSchema, createCommunitySchema, editMessageSchema, inviteMemberSchema, moderateRequestSchema, sendMessageSchema, joinCommunitySchema, sendCommunityMessageSchema, updateCommunitySchema } from "../utils/validation.js";

const router = express.Router();

router.use(authMiddleware);

// ====================== DIRECT MESSAGES ======================
router.get("/conversations", getMyConversations);
router.get("/conversation/:userId", getConversation);
router.get("/conversation/:userId/updates", getConversationUpdates);
router.post("/send", spamFilter, validate(sendMessageSchema), sendMessage);
router.get("/search", searchUsers);
router.get("/suggestions", getSuggestedUsers);
router.get("/settings", getChatSettings);
router.put("/settings", validate(chatSettingsSchema), updateChatSettings);

// ====================== PRIVACY SHIELD ======================
router.post("/screenshot-notice", reportPossibleScreenshot);
router.post("/watermark-stamp", generateWatermarkStamp);

// ====================== COMMUNITY ROOMS ======================
router.get("/communities", getMyCommunities);
router.post("/communities", validate(createCommunitySchema), createCommunity);
router.post("/communities/join", validate(joinCommunitySchema), joinCommunity);
router.get("/communities/by-key/:inviteKey", getCommunityByKey);
router.get("/communities/:communityId", getCommunityMessages);
router.get("/communities/:communityId/updates", getCommunityUpdates);
router.put("/communities/:communityId", validate(updateCommunitySchema), updateCommunity);
router.post("/communities/:communityId/messages", spamFilter, validate(sendCommunityMessageSchema), sendCommunityMessage);
router.put("/communities/:communityId/messages/:messageId", editCommunityMessage);
router.delete("/communities/:communityId/messages/:messageId", unsendCommunityMessage);
router.post("/communities/:communityId/read", markCommunityMessagesRead);
router.post("/communities/:communityId/leave", leaveCommunity);
router.post("/communities/:communityId/members/remove", validate(inviteMemberSchema), removeMember);
router.post("/communities/:communityId/invite", validate(inviteMemberSchema), inviteMember);
router.get("/communities/:communityId/join-requests", getJoinRequests);
router.post("/communities/:communityId/join-requests/:userId", validate(moderateRequestSchema), respondToJoinRequest);
router.post("/communities/:communityId/moderators", validate(inviteMemberSchema), addModerator);
router.post("/communities/:communityId/moderators/remove", validate(inviteMemberSchema), removeModerator);
router.delete("/communities/:communityId", deleteCommunity);
router.put("/communities/:communityId/disable", toggleDisableCommunity);

router.delete("/messages", deleteAllMyMessages);
router.delete("/community-messages", deleteAllMyCommunityMessages);
router.put("/edit/:messageId", validate(editMessageSchema), editMessage);
router.delete("/unsend/:messageId", unsendMessage);

export default router;
