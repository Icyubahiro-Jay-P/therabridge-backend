import express from "express";
import { chat, getCategories } from "../controllers/therry.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/chat", chat);
router.get("/categories", getCategories);

export default router;
