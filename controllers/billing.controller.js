import Stripe from "stripe";
import User from "../models/user.model.js";
import Payment from "../models/payment.model.js";
import Appointment from "../models/appointment.model.js";
import { createNotification } from "../services/notification.service.js";
import logger from "../utils/logger.js";

const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
};

const clientBaseUrl = () =>
  process.env.CLIENT_URL || "http://localhost:5173";

export const createCheckoutSession = async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({
        error: { message: "Payments are not configured yet. Please try again later.", code: "PAYMENTS_UNAVAILABLE", category: "SERVER" },
      });
    }

    const { intent, appointmentId } = req.body;
    const currency = process.env.STRIPE_CURRENCY || "usd";
    const baseUrl = clientBaseUrl();

    if (intent === "subscribe") {
      const priceId = process.env.STRIPE_PRICE_ID;
      if (!priceId) {
        return res.status(503).json({
          error: { message: "Subscriptions are not configured yet. Please try again later.", code: "PAYMENTS_UNAVAILABLE", category: "SERVER" },
        });
      }
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: req.user.email,
        metadata: { userId: req.user.id, intent: "subscribe" },
        success_url: `${baseUrl}/billing?success=1&intent=subscribe`,
        cancel_url: `${baseUrl}/billing?cancelled=1`,
      });
      return res.json({ checkoutUrl: session.url });
    }

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      user: req.user.id,
    }).populate("therapist", "firstName lastName sessionPrice");
    if (!appointment) {
      return res
        .status(404)
        .json({ error: { message: "Appointment not found.", code: "NOT_FOUND", category: "USER" } });
    }

    const amount = appointment.therapist?.sessionPrice || 0;
    if (amount <= 0) {
      return res.status(400).json({
        error: { message: "This therapist has not set a session price yet.", code: "VALIDATION_ERROR", category: "USER" },
      });
    }

    const cents = Math.round(amount * 100);
    const therapistName = `${appointment.therapist.firstName} ${appointment.therapist.lastName}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency,
      customer_email: req.user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: cents,
            product_data: { name: `Video session with ${therapistName}` },
          },
        },
      ],
      metadata: {
        userId: req.user.id,
        intent: "session",
        appointmentId: appointment._id.toString(),
      },
      success_url: `${baseUrl}/billing?success=1&intent=session`,
      cancel_url: `${baseUrl}/billing?cancelled=1`,
    });

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    logger.error({ err: error }, "Failed to create Stripe checkout session");
    throw error;
  }
};

export const handleWebhook = async (req, res) => {
  try {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !secret) {
      return res.status(400).json({ received: false });
    }
    const sig = req.headers["stripe-signature"];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }

    const session = event.data.object;

    if (event.type === "checkout.session.completed") {
      const metadata = session.metadata || {};
      if (!metadata.userId) return res.json({ received: true });

      if (metadata.intent === "subscribe") {
        await User.updateOne(
          { _id: metadata.userId },
          {
            $set: {
              "subscription.plan": "monthly",
              "subscription.status": "active",
              "subscription.stripeCustomerId": session.customer,
            },
          },
        );
        await Payment.create({
          user: metadata.userId,
          provider: "stripe",
          stripeCustomerId: session.customer,
          intent: "subscribe",
          plan: "monthly",
          amount: session.amount_total || 0,
          currency: session.currency || "usd",
          status: "paid",
          invoiceUrl: session.receipt_url || null,
        });
      } else if (metadata.intent === "session") {
        await Payment.create({
          user: metadata.userId,
          provider: "stripe",
          stripeCustomerId: session.customer,
          intent: "session",
          amount: session.amount_total || 0,
          currency: session.currency || "usd",
          status: "paid",
          invoiceUrl: session.receipt_url || null,
          appointment: metadata.appointmentId || null,
        });
        if (metadata.appointmentId) {
          await Appointment.updateOne(
            { _id: metadata.appointmentId },
            { $set: { paid: true } },
          );
        }
      }

      await createNotification(
        metadata.userId,
        "billing",
        "Payment received",
        "Your payment went through successfully. Thank you!",
        { url: "/billing" },
      );
    }

    if (event.type === "customer.subscription.deleted") {
      const user = await User.findOne({ "subscription.stripeCustomerId": session.customer });
      if (user) {
        user.subscription.status = "cancelled";
        user.subscription.plan = null;
        await user.save();
      }
    }

    res.json({ received: true });
  } catch (error) {
    logger.error({ err: error }, "Stripe webhook handler failed");
    res.status(500).json({ received: false });
  }
};

export const getBillingStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("subscription");
    const payments = await Payment.find({ user: req.user.id })
      .populate("appointment", "start status")
      .sort({ createdAt: -1 })
      .limit(50);
    res.status(200).json({
      subscription: user?.subscription || null,
      payments,
    });
  } catch (error) {
    throw error;
  }
};

export const cancelSubscription = async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({
        error: { message: "Payments are not configured yet. Please try again later.", code: "PAYMENTS_UNAVAILABLE", category: "SERVER" },
      });
    }
    const user = await User.findById(req.user.id);
    if (!user?.subscription?.stripeCustomerId || user.subscription.status !== "active") {
      return res
        .status(400)
        .json({ error: { message: "No active subscription to cancel.", code: "VALIDATION_ERROR", category: "USER" } });
    }
    const portal = await stripe.billingPortal.sessions.create({
      customer: user.subscription.stripeCustomerId,
      return_url: `${clientBaseUrl()}/billing`,
    });
    res.json({ url: portal.url });
  } catch (error) {
    logger.error({ err: error }, "Failed to create billing portal session");
    throw error;
  }
};