import { v2 as cloudinary } from "cloudinary";
import logger from "./logger.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const avatarPublicId = (userId) => `avatars/${userId}`;

export const uploadAvatarToCloudinary = (buffer, userId) => {
  return cloudinary.uploader.upload(buffer, {
    public_id: avatarPublicId(userId),
    overwrite: true,
    resource_type: "image",
    transformation: [
      { width: 400, height: 400, crop: "limit", quality: "auto", fetch_format: "auto" },
    ],
  });
};

export const deleteAvatarFromCloudinary = async (userId) => {
  try {
    await cloudinary.uploader.destroy(avatarPublicId(userId));
  } catch (error) {
    logger.error({ err: error }, "Failed to delete avatar from Cloudinary");
  }
};
