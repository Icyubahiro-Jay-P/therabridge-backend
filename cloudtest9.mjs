import "dotenv/config";
import { uploadAvatarToCloudinary } from "./utils/cloudinary.js";
import sharp from "sharp";

const buf = await sharp({
  create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 128, b: 0 } },
}).png().toBuffer();

try {
  const result = await uploadAvatarToCloudinary(buf, "debuguser123");
  console.log("OK:", result.secure_url);
} catch (e) {
  console.log("Result:", e.message);
}
