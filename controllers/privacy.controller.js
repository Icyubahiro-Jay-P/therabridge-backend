import User from "../models/user.model.js";
import sharp from "sharp";
import { recordPossibleScreenshot } from "../sockets/chatSocket.js";

const escapeSvgText = (text) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const reportPossibleScreenshot = async (req, res) => {
  try {
    const { recipientId } = req.body;
    if (!recipientId || typeof recipientId !== "string") {
      return res
        .status(400)
        .json({ error: { message: "recipientId is required.", code: "BAD_REQUEST" } });
    }

    const me = await User.findById(req.user.id);
    const result = await recordPossibleScreenshot({
      initiatorId: req.user.id,
      initiatorName: me?.firstName || me?.username || "Someone",
      peerId: recipientId,
    });

    if (result.limited) {
      return res.status(429).json({ message: "Rate limited. Please wait a moment." });
    }
    if (result.invalid) {
      return res
        .status(400)
        .json({ error: { message: "Invalid recipient.", code: "BAD_REQUEST" } });
    }

    res.status(201).json(result.notice);
  } catch (error) {
    throw error;
  }
};

export const generateWatermarkStamp = async (req, res) => {
  try {
    const { text, viewerId } = req.body;
    if (!text || typeof text !== "string" || text.trim() === "") {
      return res
        .status(400)
        .json({ error: { message: "text is required.", code: "BAD_REQUEST" } });
    }
    if (!viewerId || typeof viewerId !== "string") {
      return res
        .status(400)
        .json({ error: { message: "viewerId is required.", code: "BAD_REQUEST" } });
    }

    const safeText = escapeSvgText(text.slice(0, 2000));
    const stamp = `${escapeSvgText(viewerId)} · ${new Date().toISOString()}`;
    const width = 640;
    const height = Math.min(480, 120 + Math.ceil(safeText.length / 80) * 24);

    const tiles = [];
    for (let x = -80; x < width; x += 220) {
      for (let y = -80; y < height; y += 160) {
        tiles.push(
          `<text x="${x}" y="${y}" fill="rgba(120,120,120,0.18)" font-size="14" transform="rotate(-30 ${x} ${y})">${stamp}</text>`,
        );
      }
    }

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <text x="24" y="40" font-family="sans-serif" font-size="16" fill="#111111">${safeText}</text>
        ${tiles.join("")}
      </svg>`;

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    res.set("Content-Type", "image/png");
    res.set("X-Watermark-Stamp", stamp);
    res.set("Cache-Control", "no-store");
    res.status(200).send(png);
  } catch (error) {
    throw error;
  }
};
