const THERAPY_RESPONSES = {
  anxiety: [
    "It sounds like you're experiencing anxiety. Let's try a grounding exercise together. Name 5 things you can see, 4 you can touch, 3 you can hear, 2 you can smell, and 1 you can taste.",
    "Anxiety can feel overwhelming, but remember it's your body's natural response to perceived threats. Take a slow breath in for 4 counts, hold for 4, and exhale for 6.",
    "I hear that you're feeling anxious. Can you tell me more about what's going through your mind right now? Sometimes naming our worries helps reduce their power over us.",
  ],
  sad: [
    "I'm sorry you're feeling this way. Sadness is a valid emotion and it's okay to feel it. Would you like to talk about what's making you feel sad?",
    "When we feel sad, it can help to practice self-compassion. Try placing a hand on your heart and saying to yourself: 'This is a moment of suffering. Suffering is part of life. May I be kind to myself.'",
    "It takes courage to acknowledge sadness. Remember that emotions are temporary — this feeling will pass. In the meantime, be gentle with yourself.",
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
    "Anger is a natural emotion. Let's take a moment to breathe. Count to 10 slowly, and let's explore what's beneath the anger — often it's hurt, fear, or frustration.",
    "It's okay to feel angry. What matters is how we express it. Try describing how you feel without judgment: 'I notice anger in my body. I notice tension.'",
  ],
  general: [
    "Thank you for sharing with me. I'm here to listen and support you. Would you like to tell me more about what's on your mind?",
    "That sounds challenging. Remember that seeking support is a sign of strength, not weakness. How can I best support you right now?",
    "I appreciate you opening up. Let's take a moment to check in with your body. Close your eyes and notice any areas of tension. Take a deep breath and imagine sending warmth to those areas.",
    "One helpful practice is to ask yourself: 'What do I need right now?' It could be rest, connection, movement, or simply a glass of water. Listen to what your mind and body are telling you.",
    "You are not alone in this journey. Every step you take toward healing matters, no matter how small it seems. What would feel like a small step forward today?",
  ],
  crisis: [
    "I'm concerned about what you're sharing. If you're in immediate danger or thinking about harming yourself, please reach out for help right away:\n\n• Emergency Services: 911\n• National Suicide Prevention Lifeline: 988\n• Crisis Text Line: Text HOME to 741741\n\nYou matter and there are people who care about you.",
    "Your safety is the most important thing. Please contact emergency services immediately if you're in danger. You deserve support and care.",
  ],
};

function getResponseCategory(input) {
  const lower = input.toLowerCase();
  if (/\b(anxi|worry|panic|nervous|fear|dread)\b/.test(lower)) return "anxiety";
  if (/\b(sad|depress|unhappy|down|cry|crying|miserable|hopeless)\b/.test(lower)) return "sad";
  if (/\b(stress|overwhelm|pressure|burnout|exhausted)\b/.test(lower)) return "stress";
  if (/\b(lonely|alone|isolat|no one|nobody|abandon)\b/.test(lower)) return "lonely";
  if (/\b(angry|frustrat|irritat|mad|rage|annoy)\b/.test(lower)) return "angry";
  if (/\b(suicid|kill myself|end my life|want to die|harm myself|hurt myself)\b/.test(lower)) return "crisis";
  return "general";
}

export const chat = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === "") {
      return res.status(400).json({ message: "Message cannot be empty." });
    }
    const category = getResponseCategory(message);
    const responses = THERAPY_RESPONSES[category];
    const response = responses[Math.floor(Math.random() * responses.length)];
    const isCrisis = category === "crisis";
    res.status(200).json({
      reply: response,
      category,
      isCrisis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCategories = async (req, res) => {
  res.status(200).json({
    categories: Object.keys(THERAPY_RESPONSES),
  });
};
