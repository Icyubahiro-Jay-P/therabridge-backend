import multer from "multer";

// Uploads are buffered in memory, validated by magic bytes, and uploaded
// straight to Cloudinary - never written to the server's disk, which is
// ephemeral on Render and wiped on every deploy.

// Magic-byte sniffing: the browser-reported MIME type and the file extension
// are both attacker-controlled, so we verify the actual file signature before
// the upload is accepted. This stops a `.jpg` that is really an HTML/SVG or
// other executable payload.
const IMAGE_SIGNATURES = [
  { name: "jpeg", bytes: [0xff, 0xd8, 0xff] },
  { name: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { name: "gif", bytes: [0x47, 0x49, 0x46, 0x38] }, // "GIF8"
  { name: "webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF" - verified further below
];

export const hasValidImageSignature = (buf) => {
  if (!buf || buf.length < 12) return false;
  const sig = IMAGE_SIGNATURES.find(({ name, bytes }) =>
    bytes.every((b, i) => buf[i] === b),
  );
  if (!sig) return false;
  // WebP must also contain the "WEBP" brand four bytes in.
  if (sig.name === "webp" && buf.slice(8, 12).toString("latin1") !== "WEBP") {
    return false;
  }
  return true;
};

export const sniffUpload = async (buffer) => hasValidImageSignature(buffer);

const fileFilter = (req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
  if (allowed.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(
      new Error("Only image files (jpg, jpeg, png, gif, webp) are allowed"),
      false,
    );
  }
};

const MAX_UPLOAD_SIZE = 1.4 * 1024 * 1024; // 1.4 MB

export const uploadProfilePic = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_SIZE },
}).single("avatar");
