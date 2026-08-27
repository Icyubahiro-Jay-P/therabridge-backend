import express from "express";
import {
  createCheckoutSession,
  handleWebhook,
  getBillingStatus,
  cancelSubscription,
} from "../controllers/billing.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { jsonBody } from "../middleware/jsonBody.js";
import { validate } from "../utils/validation.js";
import { checkoutSchema } from "../utils/validation.js";

const router = express.Router();

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook,
);

router.get("/status", authMiddleware, getBillingStatus);
router.post("/checkout", authMiddleware, jsonBody("10kb"), validate(checkoutSchema), createCheckoutSession);
router.post("/cancel", authMiddleware, jsonBody("10kb"), cancelSubscription);

export default router;