import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "..", "uploads"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${req.user.id}_${Date.now()}`;
    cb(null, `profile_${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
  if (allowed.test(path.extname(file.originalname))) {
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
  storage,
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_SIZE },
}).single("avatar");
