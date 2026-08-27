import mongoose from "mongoose";
import Review from "../models/review.model.js";
import User from "../models/user.model.js";
import {
  getPaginationParams,
  formatPaginatedResponse,
} from "../utils/pagination.js";
import { logAccess, ipFromReq, uaFromReq } from "../services/audit.service.js";

const findTherapist = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return User.findOne({ _id: id, role: "therapist" });
};

export const createTherapistReview = async (req, res) => {
  try {
    const id = req.params.id;
    if (req.user.role !== "user") {
      return res
        .status(403)
        .json({ error: { message: "Only users can leave reviews.", code: "FORBIDDEN", category: "USER" } });
    }
    const therapist = await findTherapist(id);
    if (!therapist) {
      return res
        .status(404)
        .json({ error: { message: "Therapist not found.", code: "NOT_FOUND", category: "USER" } });
    }
    if (therapist._id.toString() === req.user.id) {
      return res
        .status(400)
        .json({ error: { message: "You cannot review yourself.", code: "VALIDATION_ERROR", category: "USER" } });
    }

    const existing = await Review.findOne({
      reviewer: req.user.id,
      therapist: therapist._id,
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: { message: "You have already reviewed this therapist.", code: "DUPLICATE_ERROR", category: "USER" } });
    }

    const { rating, title, content } = req.body;
    const review = new Review({
      reviewer: req.user.id,
      therapist: therapist._id,
      rating,
      title: title || "",
      content,
    });
    await review.save();

    await logAccess({
      actor: req.user.id,
      actorRole: req.user.role,
      action: "therapist_review_created",
      targetType: "user",
      target: therapist._id,
      detail: { rating },
      ip: ipFromReq(req),
      userAgent: uaFromReq(req),
    });

    res.status(201).json(review);
  } catch (error) {
    throw error;
  }
};

export const getTherapistReviews = async (req, res) => {
  try {
    const therapist = await findTherapist(req.params.id);
    if (!therapist) {
      return res
        .status(404)
        .json({ error: { message: "Therapist not found.", code: "NOT_FOUND", category: "USER" } });
    }
    const { page, limit, offset } = getPaginationParams(req.query, 10);
    const filter = { therapist: therapist._id, isHidden: false };

    const total = await Review.countDocuments(filter);
    const reviews = await Review.find(filter)
      .populate("reviewer", "firstName lastName username avatar")
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit);

    res.status(200).json(formatPaginatedResponse(reviews, total, page, limit));
  } catch (error) {
    throw error;
  }
};