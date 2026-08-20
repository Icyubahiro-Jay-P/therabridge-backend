import User from "../models/user.model.js";
import sharp from "sharp";
import { uploadAvatarToCloudinary, deleteAvatarFromCloudinary } from "../utils/cloudinary.js";
import { sniffUpload } from "../middleware/upload.js";

export const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Verify the real file signature (magic bytes), not just the extension.
    const isImage = await sniffUpload(req.file.buffer);
    if (!isImage) {
      return res
        .status(400)
        .json({ message: "File is not a valid image." });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Optimize the uploaded avatar buffer with Sharp before it goes to
    // Cloudinary. Uploads never touch the server disk.
    let uploadBuffer = req.file.buffer;
    try {
      uploadBuffer = await sharp(req.file.buffer, { failOn: "none" })
        .rotate()
        .resize({
          width: 400,
          height: 400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80, effort: 6 })
        .toBuffer();
    } catch {
      // Sharp's decoder (libspng) is stricter than browsers and rejects some
      // images (e.g. slightly malformed PNGs). The signature check above
      // already confirmed this is a real image, so upload the original.
    }

    const result = await uploadAvatarToCloudinary(uploadBuffer, user.id);
    user.avatar = result.secure_url;
    await user.save();

    res.status(200).json({
      message: "Profile picture uploaded successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        privacySettings: user.privacySettings,
      },
    });
  } catch (error) {
    throw error;
  }
};

export const deleteAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.avatar) {
      await deleteAvatarFromCloudinary(user.id);
    }

    user.avatar = null;
    await user.save();

    res.status(200).json({
      message: "Profile picture removed successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        privacySettings: user.privacySettings,
      },
    });
  } catch (error) {
    throw error;
  }
};
