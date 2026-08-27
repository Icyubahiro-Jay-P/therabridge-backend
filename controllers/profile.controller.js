import User from "../models/user.model.js";
import Review from "../models/review.model.js";
import {
  getPaginationParams,
  formatPaginatedResponse,
  parseSortParams,
  parseFilterParams,
} from "../utils/pagination.js";
import { logAccess, ipFromReq, uaFromReq } from "../services/audit.service.js";

// Aggregate rating + review count per therapist id (used by list + detail).
const getRatingsFor = async (therapistIds) => {
  if (therapistIds.length === 0) return new Map();
  const rows = await Review.aggregate([
    { $match: { therapist: { $in: therapistIds }, isHidden: false } },
    {
      $group: {
        _id: "$therapist",
        avg: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);
  return new Map(
    rows.map((r) => [
      r._id.toString(),
      { rating: Math.round(r.avg * 10) / 10, reviewCount: r.count },
    ]),
  );
};

export const profile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "-password -oldPasswords -refreshTokens -resetPasswordToken -resetPasswordExpire -verificationCode -verificationCodeExpire",
    );
    if (!user) {
      return res.status(404).json({ error: { message: "User not found", code: "NOT_FOUND", category: "USER" } });
    }
    res.status(200).json(user);
  } catch (error) {
    throw error;
  }
};

// get other user profile by username (privacy-filtered)
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select(
      "-password -oldPasswords -resetPasswordToken -resetPasswordExpire -refreshTokens -verificationCode -verificationCodeExpire",
    );
    if (!user) {
      return res.status(404).json({ error: { message: "User not found", code: "NOT_FOUND", category: "USER" } });
    }

    // If requesting own profile, return everything
    if (req.user && user._id.toString() === req.user.id) {
      return res.status(200).json(user);
    }

    // Filter based on privacy settings
    const privacy = user.privacySettings || {};
    const filtered = user.toObject();

    for (const field of [
      "firstName",
      "lastName",
      "email",
      "dateOfBirth",
      "bio",
    ]) {
      if (privacy[field] === "private") {
        filtered[field] = null;
      }
    }

    // Always include these regardless
    filtered.username = user.username;
    filtered.role = user.role;
    filtered.avatar = user.avatar;
    filtered._id = user._id;
    filtered.createdAt = user.createdAt;
    filtered.privacySettings = undefined;

    res.status(200).json(filtered);
  } catch (error) {
    throw error;
  }
};

// get user by ID (admin / chat lookup)
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "-password -oldPasswords -refreshTokens -verificationCode -verificationCodeExpire",
    );
    if (!user) {
      return res.status(404).json({ error: { message: "User not found", code: "NOT_FOUND", category: "USER" } });
    }

    // If requesting own profile, return everything
    if (req.user && user._id.toString() === req.user.id) {
      return res.status(200).json(user);
    }

    // Filter based on privacy settings
    const privacy = user.privacySettings || {};
    const filtered = user.toObject();

    for (const field of [
      "firstName",
      "lastName",
      "email",
      "dateOfBirth",
      "bio",
    ]) {
      if (privacy[field] === "private") {
        filtered[field] = null;
      }
    }

    filtered.username = user.username;
    filtered.role = user.role;
    filtered.avatar = user.avatar;
    filtered._id = user._id;
    filtered.createdAt = user.createdAt;
    filtered.privacySettings = undefined;

    // Only privileged roles viewing another user are audited (normal public
    // profile browsing is not a privacy-sensitive event).
    if (
      req.user.role !== "user" &&
      user._id.toString() !== req.user.id
    ) {
      await logAccess({
        actor: req.user.id,
        actorRole: req.user.role,
        action: "user_profile_view",
        targetType: "user",
        target: user._id,
        detail: { scope: "filtered" },
        ip: ipFromReq(req),
        userAgent: uaFromReq(req),
      });
    }

    res.status(200).json(filtered);
  } catch (error) {
    throw error;
  }
};

export const updateProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      dateOfBirth,
      bio,
      specialization,
      credentials,
      yearsExperience,
      languages,
      weeklyAvailability,
    } = req.body;

    const updates = {};

    if (firstName) {
      if (firstName.length < 2) {
        return res
          .status(400)
          .json({ error: { message: "First name must be at least 2 characters long.", code: "VALIDATION_ERROR", category: "USER" } });
      }
      updates.firstName = firstName;
    }

    if (lastName) {
      if (lastName.length < 2) {
        return res
          .status(400)
          .json({ error: { message: "Last name must be at least 2 characters long.", code: "VALIDATION_ERROR", category: "USER" } });
      }
      updates.lastName = lastName;
    }

    if (dateOfBirth) {
      const today = new Date();
      const birthDate = new Date(dateOfBirth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        age--;
      }
      if (age < 18 || age > 120) {
        return res
          .status(400)
          .json({ error: { message: "Invalid age. Must be between 18 and 120.", code: "VALIDATION_ERROR", category: "USER" } });
      }
      updates.dateOfBirth = dateOfBirth;
    }

    if (bio !== undefined) updates.bio = bio;

    // Therapist display/booking fields are only persisted for therapists.
    const isTherapist = req.user.role === "therapist";
    if (specialization !== undefined && isTherapist) updates.specialization = specialization;
    if (credentials !== undefined && isTherapist) updates.credentials = credentials;
    if (yearsExperience !== undefined && isTherapist) updates.yearsExperience = yearsExperience;
    if (languages !== undefined && isTherapist) updates.languages = languages;
    if (weeklyAvailability !== undefined && isTherapist) updates.weeklyAvailability = weeklyAvailability;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true },
    ).select(
      "-password -oldPasswords -resetPasswordToken -resetPasswordExpire -refreshTokens -verificationCode -verificationCodeExpire",
    );

    if (!user) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND", category: "USER" } });
    }

    res.status(200).json({
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    throw error;
  }
};

export const getTherapists = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query, 50);
    const sort = parseSortParams(req.query, [
      "firstName",
      "lastName",
      "createdAt",
    ]);
    const filter = parseFilterParams(req.query, ["firstName", "lastName"]);

    // Add role filter
    filter.role = "therapist";

    const total = await User.countDocuments(filter);
    const therapists = await User.find(filter)
      .select("-password -oldPasswords -refreshTokens -verificationCode -verificationCodeExpire")
      .sort(sort)
      .limit(limit)
      .skip(offset);

    const ratings = await getRatingsFor(therapists.map((t) => t._id));
    const data = therapists.map((t) => {
      const { rating, reviewCount } = ratings.get(t._id.toString()) || {
        rating: 0,
        reviewCount: 0,
      };
      return { ...t.toObject(), rating, reviewCount };
    });

    res
      .status(200)
      .json(formatPaginatedResponse(data, total, page, limit));
  } catch (error) {
    throw error;
  }
};

export const getTherapistById = async (req, res) => {
  try {
    const therapist = await User.findOne({
      _id: req.params.id,
      role: "therapist",
    }).select(
      "-password -oldPasswords -refreshTokens -verificationCode -verificationCodeExpire -resetPasswordToken -resetPasswordExpire -twoFactorSecret -twoFactorBackupCodes",
    );
    if (!therapist) {
      return res
        .status(404)
        .json({ error: { message: "Therapist not found.", code: "NOT_FOUND", category: "USER" } });
    }
    const ratings = await getRatingsFor([therapist._id]);
    const agg = ratings.get(therapist._id.toString()) || { rating: 0, reviewCount: 0 };
    res.status(200).json({ ...therapist.toObject(), ...agg });
  } catch (error) {
    throw error;
  }
};

export const getTherapistByUsername = async (req, res) => {
  try {
    const therapist = await User.findOne({
      username: req.params.username,
      role: "therapist",
    }).select(
      "-password -oldPasswords -refreshTokens -verificationCode -verificationCodeExpire -resetPasswordToken -resetPasswordExpire -twoFactorSecret -twoFactorBackupCodes",
    );
    if (!therapist) {
      return res
        .status(404)
        .json({ error: { message: "Therapist not found.", code: "NOT_FOUND", category: "USER" } });
    }
    const ratings = await getRatingsFor([therapist._id]);
    const agg = ratings.get(therapist._id.toString()) || { rating: 0, reviewCount: 0 };
    res.status(200).json({ ...therapist.toObject(), ...agg });
  } catch (error) {
    throw error;
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const { limit, offset } = getPaginationParams(req.query, 500);
    const sort = parseSortParams(req.query, [
      "firstName",
      "lastName",
      "email",
      "createdAt",
    ]);
    const filter = parseFilterParams(req.query, [
      "firstName",
      "lastName",
      "email",
      "role",
    ]);

    const users = await User.find(filter)
      .select("-password -oldPasswords -resetPasswordToken -resetPasswordExpire -refreshTokens -verificationCode -verificationCodeExpire")
      .populate("therapist", "firstName lastName username")
      .sort(sort)
      .limit(limit)
      .skip(offset);

    res.status(200).json(users);
  } catch (error) {
    throw error;
  }
};
