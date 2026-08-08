import "dotenv/config";
import crypto from "crypto";
import sharp from "sharp";

const cloud = process.env.CLOUDINARY_CLOUD_NAME;
const key = process.env.CLOUDINARY_API_KEY;
const secret = process.env.CLOUDINARY_API_SECRET;

const buf = await sharp({
  create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 128, b: 0 } },
}).png().toBuffer();
const dataUri = `data:image/png;base64,${buf.toString("base64")}`;

const timestamp = Math.floor(Date.now() / 1000);
const publicId = `avatars/debug_${Date.now()}`;
const toSign = `public_id=${publicId}&timestamp=${timestamp}${secret}`;
const signature = crypto.createHash("sha1").update(toSign).digest("hex");

const form = new FormData();
form.append("file", dataUri);
form.append("public_id", publicId);
form.append("api_key", key);
form.append("timestamp", String(timestamp));
form.append("signature", signature);

const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
  method: "POST",
  body: form,
});
console.log("status:", res.status);
console.log("body:", await res.text());
