import express from "express";
import {
  openProtectedContent,
  refreshProtectedSession,
  reportScreenshotEvent,
} from "../controllers/screenshotEvent.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { jsonBody } from "../middleware/jsonBody.js";
import {
  validate,
  createSessionSchema,
  refreshSessionSchema,
  screenshotEventSchema,
} from "../utils/validation.js";

const router = express.Router();

router.use(jsonBody("16kb"));
router.use(authMiddleware);

// Protected-content viewing sessions gate screenshot-event reporting.
router.post("/protected/session", validate(createSessionSchema), openProtectedContent);
router.post("/protected/session/refresh", validate(refreshSessionSchema), refreshProtectedSession);

// Screenshot / screen-capture event reporting. Server derives the real actor
// and owner; all ownership/permission data comes from the authenticated session.
router.post("/screenshot-events", validate(screenshotEventSchema), reportScreenshotEvent);

export default router;
