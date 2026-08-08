import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";
import sharp from "sharp";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const buf = await sharp({
  create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 128, b: 0 } },
}).png().toBuffer();

const uploadStream = (buffer, options) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
    if (error) return reject(error);
    resolve(result);
  });
  Readable.from(buffer).pipe(stream);
});

try {
  const ping = await cloudinary.api.ping();
  console.log("PING OK:", JSON.stringify(ping));
} catch (e) {
  console.log("PING ERROR:", e.message, "| http_code:", e.http_code);
}

try {
  const result = await uploadStream(buf, { public_id: `avatars/test_${Date.now()}`, resource_type: "image" });
  console.log("UPLOAD (no transformation) OK:", result.secure_url);
} catch (e) {
  console.log("UPLOAD (no transformation) ERROR:", e.message, "| http_code:", e.http_code);
}
