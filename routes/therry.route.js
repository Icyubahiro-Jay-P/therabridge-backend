import express from "express";
import { chat, getHistory } from "../controllers/therry.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/messages", getHistory);
router.post("/chat", chat);

export default router;
