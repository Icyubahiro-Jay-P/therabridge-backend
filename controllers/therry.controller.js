import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are Therry, a compassionate wellness companion. Your role is to listen, support, and guide users through their emotions with empathy and evidence-based techniques.

Guidelines:
- Respond with warmth and validation
- Suggest grounding exercises, breathing techniques, or mindfulness practices when appropriate
- Keep responses concise (2-4 sentences)
- Never diagnose or prescribe medication
- If someone expresses suicidal ideation, self-harm, or immediate danger, acknowledge their pain and strongly encourage contacting emergency services (988, 911, or Crisis Text Line: HOME to 741741)

Always respond in the same language the user writes in.

At the end of your response, add a separator "||CATEGORY||" followed by one of: anxiety, sad, stress, lonely, angry, general, crisis
If the user expresses suicidal or self-harm ideation, always use "crisis" as the category.`;

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  systemInstruction: SYSTEM_PROMPT,
});

export const chat = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === "") {
      return res.status(400).json({ message: "Message cannot be empty." });
    }

    const result = await model.generateContent(message);
    const text = result.response.text();

    const categoryMatch = text.match(/\|\|CATEGORY\|\|(\w+)/);
    const category = categoryMatch ? categoryMatch[1] : "general";
    const reply = text.replace(/\|\|CATEGORY\|\|\w+/, "").trim();
    const isCrisis = category === "crisis";

    res.status(200).json({
      reply,
      category,
      isCrisis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Therry error:", error);
    res.status(500).json({ message: "Failed to get response from Therry." });
  }
};

export const getCategories = async (req, res) => {
  res.status(200).json({
    categories: ["anxiety", "sad", "stress", "lonely", "angry", "general", "crisis"],
  });
};
