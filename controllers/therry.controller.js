import { GoogleGenerativeAI } from "@google/generative-ai";
import { analyzeAll } from "../services/mlClient.js";
import { TherryMessage } from "../models/therryMessage.model.js";
import Crisis from "../models/crisis.model.js";
import CrisisLog from "../models/crisisLog.model.js";
import User from "../models/user.model.js";
import { createNotification } from "../services/notification.service.js";
import { awardMessagePoints, MESSAGE_POINTS } from "../utils/points.js";
import { withTransaction } from "../utils/transactions.js";
import { encryptField, decryptField } from "../utils/crypto.js";
import { getHotlinesForCountry } from "../utils/hotlines.js";
import { getPanicExercise } from "./exercise.controller.js";
import logger from "../utils/logger.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are Therry, an empathetic wellness companion in a mental health support app. You listen with warmth, validate the user's feelings, and offer gentle, practical coping suggestions (e.g. grounding exercises, breathing techniques, journaling prompts). Keep responses warm, concise, and under 6 sentences. Never diagnose or claim to be a licensed therapist. If the user shares thoughts of suicide or self-harm, respond with immediate support and strongly encourage them to contact emergency services (911), call/text 988, or text HOME to 741741.`;

function getResponseCategory(message) {
  const lower = message.toLowerCase();
  if (/suicid|kill myself|end my life|want to die|self.?harm/i.test(lower)) return "crisis";
  if (/anxious|anxiety|panic|worried|nervous/i.test(lower)) return "anxiety";
  if (/sad|depress|unhappy|cry|crying|hopeless/i.test(lower)) return "sad";
  if (/stress|overwhelm|burnout|exhausted|pressure/i.test(lower)) return "stress";
  if (/lonely|alone|isolated|no one|nobody/i.test(lower)) return "lonely";
  if (/angry|frustrated|annoyed|irritated|rage/i.test(lower)) return "angry";
  return "general";
}

const CRISIS_RESPONSES = [
  "I'm concerned about what you're sharing. If you're in immediate danger or thinking about harming yourself, please reach out for help right away:\n\n• Emergency Services: 911\n• National Suicide Prevention Lifeline: 988\n• Crisis Text Line: Text HOME to 741741\n\nYou matter and there are people who care about you.",
  "Your safety is the most important thing. Please contact emergency services immediately if you're in danger. You deserve support and care.",
];

const FALLBACK_RESPONSES = {
  anxiety: [
    "It sounds like you're experiencing anxiety. Let's try a grounding exercise together. Name 5 things you can see, 4 you can touch, 3 you can hear, 2 you can smell, and 1 you can taste.",
    "Anxiety can feel overwhelming, but remember it's your body's natural response to perceived threats. Take a slow breath in for 4 counts, hold for 4, and exhale for 6.",
    "I hear that you're feeling anxious. Can you tell me more about what's going through your mind right now? Sometimes naming our worries helps reduce their power over us.",
  ],
  sad: [
    "I'm sorry you're feeling this way. Sadness is a valid emotion and it's okay to feel it. Would you like to talk about what's making you feel sad?",
    "When we feel sad, it can help to practice self-compassion. Try placing a hand on your heart and saying to yourself: 'This is a moment of suffering. Suffering is part of life. May I be kind to myself.'",
    "It takes courage to acknowledge sadness. Remember that emotions are temporary - this feeling will pass. In the meantime, be gentle with yourself.",
  ],
  stress: [
    "Stress often comes from feeling overwhelmed. Let's break things down. What's one small thing you can do right now to lighten your load?",
    "Progressive muscle relaxation can help with stress. Try tensing your shoulders for 5 seconds, then releasing. Notice the difference between tension and relaxation.",
    "You're carrying a lot right now. It's important to remember that you don't have to do everything at once. What's the most important thing you need right now?",
  ],
  lonely: [
    "Loneliness can be really difficult. Remember that being alone doesn't mean being unloved. Would you like to talk about how you're feeling?",
    "I want you to know that you matter. Loneliness is a signal that we need connection. Is there someone you could reach out to today, even just for a short chat?",
    "It's brave of you to share your feelings of loneliness. Sometimes writing in a journal can help. What would you say to a friend who felt this way?",
  ],
  angry: [
    "Anger is a natural emotion. Let's take a moment to breathe. Count to 10 slowly, and let's explore what's beneath the anger - often it's hurt, fear, or frustration.",
    "It's okay to feel angry. What matters is how we express it. Try describing how you feel without judgment: 'I notice anger in my body. I notice tension.'",
  ],
  general: [
    "Thank you for sharing with me. I'm here to listen and support you. Would you like to tell me more about what's on your mind?",
    "That sounds challenging. Remember that seeking support is a sign of strength, not weakness. How can I best support you right now?",
    "I appreciate you opening up. Let's take a moment to check in with your body. Close your eyes and notice any areas of tension. Take a deep breath and imagine sending warmth to those areas.",
    "One helpful practice is to ask yourself: 'What do I need right now?' It could be rest, connection, movement, or simply a glass of water. Listen to what your mind and body are telling you.",
    "You are not alone in this journey. Every step you take toward healing matters, no matter how small it seems. What would feel like a small step forward today?",
  ],
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

const model = genAI.getGenerativeModel({
  model: "gemini-3.5-flash",
  systemInstruction: SYSTEM_PROMPT,
});

const saveMessage = async (userId, role, content, category) => {
  try {
    return await TherryMessage.create({
      user: userId,
      role,
      content: encryptField(content),
      category,
    });
  } catch (error) {
    logger.error({ err: error }, "Therry save error");
    return null;
  }
};

const chooseCrisisAlertType = (message) => {
  const lower = message.toLowerCase();
  if (/suicid|kill myself|end my life|want to die|self.?harm/i.test(lower)) {
    return "self_harm_thoughts";
  }
  if (/panic|hyperventilat/i.test(lower)) return "panic_attack";
  return "severe_distress";
};

// When Therry classifies a message as a crisis, record a CrisisLog, open a
// Crisis alert, and notify the user's assigned therapist (or an admin if no
// therapist is assigned). Never throws - Therry chat must keep working even if
// the escalation machinery fails.
const handleTherryCrisis = async ({ userId, therryMessage, rawMessage }) => {
  try {
    const alertType = chooseCrisisAlertType(rawMessage);
    // Derive the user-facing severity from the alert type so manual alerts and
    // Therry-detected alerts share one escalation scale.
    const severityMap = {
      self_harm_thoughts: "severe",
      emergency: "severe",
      immediate_danger: "severe",
      severe_distress: "medium",
      panic_attack: "medium",
    };
    const severity = severityMap[alertType] ?? "medium";
    const crisisLogSeverity =
      severity === "severe" ? "critical" : severity === "medium" ? "high" : "low";
    const urgent = severity === "severe";

    const crisis = await Crisis.create({
      user: userId,
      alertType,
      severity,
      description: encryptField(rawMessage),
      source: "therry",
      therryMessageId: therryMessage?._id || null,
      status: "active",
      resourcesShared: [],
    });
    const log = await CrisisLog.create({
      user: userId,
      therryMessageId: therryMessage?._id || null,
      excerpt: encryptField(String(rawMessage).slice(0, 280)),
      source: "therry",
      actionTaken: "crisis_alert_created",
      severity: crisisLogSeverity,
      detectedAt: new Date(),
    });

    const user = await User.findById(userId).select("therapist countryCode");
    const therapistId = user?.therapist || null;
    let therapistNotified = false;

    if (therapistId) {
      const notified = await createNotification(
        therapistId,
        "crisis_alert",
        urgent ? "URGENT Crisis Alert" : "Crisis Alert",
        urgent
          ? "A client you support may be in immediate danger. Please reach out right away."
          : "A client you support may be in crisis. Please reach out as soon as possible.",
        { crisisId: crisis._id, userId, source: "therry", severity, ...(urgent ? { priority: "urgent" } : {}) },
        userId,
      );
      therapistNotified = !!notified;
    } else {
      const admins = await User.find({ role: "admin" }).select("_id");
      if (admins.length > 0) {
        await Promise.all(
          admins.map((admin) =>
            createNotification(
              admin._id,
              "crisis_alert",
              urgent ? "URGENT Crisis Alert" : "Crisis Alert",
              urgent
                ? "A user may be in immediate danger and has no therapist assigned. Please reach out right away."
                : "A user may be in crisis and has no therapist assigned. Please reach out.",
              { crisisId: crisis._id, userId, source: "therry", severity, ...(urgent ? { priority: "urgent" } : {}) },
              userId,
            ),
          ),
        );
        therapistNotified = true;
      }
    }

    // Panic attacks get a grounding/breathing exercise recommended as the
    // first response, so the client can launch the exercise engine alongside
    // the crisis card (B2).
    const panicExercise =
      alertType === "panic_attack" ? await getPanicExercise() : null;

    return {
      logId: log._id,
      crisisId: crisis._id,
      alertType,
      severity,
      hotlines: getHotlinesForCountry(user?.countryCode),
      therapistNotified,
      ...(panicExercise ? { panicExercise } : {}),
    };
  } catch (error) {
    logger.error({ err: error }, "Therry crisis handling error");
    return null;
  }
};

export const chat = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === "") {
      return res.status(400).json({ message: "Message cannot be empty." });
    }
    if (message.trim().length > 4000) {
      return res.status(400).json({ message: "Message is too long (maximum 4000 characters)." });
    }

    const aiResults = await analyzeAll(message);

    let category = getResponseCategory(message);
    let isCrisis = category === "crisis";

    if (aiResults) {
      if (aiResults.crisis?.is_crisis) {
        isCrisis = true;
        category = "crisis";
      }

      if (!isCrisis && aiResults.sentiment) {
        const sentimentMap = {
          negative: "sad",
          positive: "general",
          neutral: "general",
        };
        category = sentimentMap[aiResults.sentiment.sentiment] || category;
      }

      if (aiResults.spam?.is_spam) {
        return res.status(400).json({
          message: "I'm here to support you with meaningful conversations. Please share what's on your mind.",
          category: "general",
          isCrisis: false,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const userMsg = await saveMessage(
      req.user.id,
      "user",
      message.trim(),
      category,
    );

    let crisisInfo = null;
    if (isCrisis) {
      crisisInfo = await handleTherryCrisis({
        userId: req.user.id,
        therryMessage: userMsg,
        rawMessage: message.trim(),
      });
    }

    let reply;
    if (isCrisis) {
      reply = pick(CRISIS_RESPONSES);
    } else {
      try {
        const result = await model.generateContent(message);
        reply = result.response.text().trim().slice(0, 4000);
      } catch (aiError) {
        logger.error({ err: aiError }, "Gemini generation error");
        reply = pick(FALLBACK_RESPONSES[category] || FALLBACK_RESPONSES.general);
      }
    }

    await saveMessage(req.user.id, "assistant", reply, category);

    const pointsEarned = await awardMessagePoints(
      req.user.id,
      MESSAGE_POINTS.therry,
    );

    res.status(200).json({
      reply,
      category,
      isCrisis,
      crisis: crisisInfo
          ? {
              detected: true,
              alertType: crisisInfo.alertType,
              severity: crisisInfo.severity,
              hotlines: crisisInfo.hotlines,
              therapistNotified: crisisInfo.therapistNotified,
              ...(crisisInfo.panicExercise
                ? { panicExercise: crisisInfo.panicExercise }
                : {}),
            }
        : undefined,
      pointsEarned,
      timestamp: new Date().toISOString(),
      _ai: aiResults ? {
        sentiment: aiResults.sentiment?.sentiment,
        spam_score: aiResults.spam?.spam_score,
        crisis_score: aiResults.crisis?.crisis_score,
      } : undefined,
    });
  } catch (error) {
    logger.error({ err: error }, "Therry error");
    res.status(500).json({ message: "Failed to get response from Therry." });
  }
};

export const getHistory = async (req, res) => {
  try {
    const messages = await TherryMessage.find({ user: req.user.id })
      .sort({ createdAt: 1 })
      .limit(500)
      .select("role content category createdAt edited editCount");

    const payload = messages.map((m) => {
      const obj = m.toObject();
      obj.content = decryptField(obj.content);
      return obj;
    });

    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({ error: { message: error.message, code: "INTERNAL_ERROR" } });
  }
};

export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content || content.trim() === "") {
      return res.status(400).json({ error: { message: "Message content cannot be empty.", code: "BAD_REQUEST" } });
    }
    if (content.trim().length > 4000) {
      return res.status(400).json({ error: { message: "Message is too long (maximum 4000 characters).", code: "BAD_REQUEST" } });
    }

    const message = await TherryMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: { message: "Message not found.", code: "NOT_FOUND" } });
    }

    if (message.user.toString() !== req.user.id) {
      return res.status(403).json({ error: { message: "You can only edit your own messages.", code: "FORBIDDEN" } });
    }

    if (message.role !== "user") {
      return res.status(400).json({ error: { message: "You can only edit your own messages.", code: "BAD_REQUEST" } });
    }

    if (message.editCount >= 3) {
      return res.status(400).json({ error: { message: "Maximum of 3 edits per message.", code: "BAD_REQUEST" } });
    }

    const tenMinutes = 10 * 60 * 1000;
    const age = Date.now() - new Date(message.createdAt).getTime();
    if (age > tenMinutes) {
      return res.status(400).json({ error: { message: "Can only edit messages within 10 minutes.", code: "BAD_REQUEST" } });
    }

    message.editHistory.push({
      content: message.content,
      editedAt: new Date(),
    });
    message.content = encryptField(content.trim());
    message.edited = true;
    message.editCount += 1;

    await message.save();

    res.status(200).json({
      _id: message._id,
      role: "user",
      content: decryptField(message.content),
      category: message.category,
      createdAt: message.createdAt,
      edited: message.edited,
      editCount: message.editCount,
    });
  } catch (error) {
    logger.error({ err: error }, "Therry edit error");
    res.status(500).json({ message: "Failed to edit message." });
  }
};
