import express from "express";
import { chat, getHistory, editMessage } from "../controllers/therry.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/messages", getHistory);
router.post("/chat", chat);
router.put("/messages/:messageId", editMessage);

export default router;
