import express from "express";
import { chat, getHistory, editMessage } from "../controllers/therry.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { jsonBody } from "../middleware/jsonBody.js";
import { validate, therryChatSchema, therryEditSchema } from "../utils/validation.js";

const router = express.Router();

// Therry content can be up to 4000 chars; JSON escaping can expand that to
// ~24kb, so the body limit is larger than the other chat routes.
router.use(jsonBody("32kb"));
router.use(authMiddleware);

router.get("/messages", getHistory);
router.post("/chat", validate(therryChatSchema), chat);
router.put("/messages/:messageId", validate(therryEditSchema), editMessage);

export default router;
