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

const t = (name, opts) => uploadStream(buf, opts)
  .then(r => console.log(`${name}: OK ${r.public_id}`))
  .catch(e => console.log(`${name}: ${e.message} (http ${e.http_code})`));

await t("no-folder-root", {});
await t("folder-avatars", { folder: "avatars" });
await t("public-id-only", { public_id: `t_${Date.now()}` });
await cloudinary.api.usage().then(u => console.log("usage:", JSON.stringify(u)).length ? console.log("usage OK") : null).catch(e => console.log("usage error:", e.message, e.http_code));
