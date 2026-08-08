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
  const r = await uploadStream(buf, { public_id: `avatars/debug_${Date.now()}` });
  console.log("OK", r.secure_url);
} catch (e) {
  console.log("FULL ERROR OBJECT:");
  console.log(JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
}
