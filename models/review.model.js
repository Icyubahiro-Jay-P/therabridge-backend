import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    therapist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      default: "",
      maxlength: 80,
    },
    content: {
      type: String,
      required: true,
      maxlength: 500,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

reviewSchema.index({ reviewer: 1, therapist: 1 }, { unique: true });
reviewSchema.index({ therapist: 1, createdAt: -1 });

export default mongoose.model("Review", reviewSchema);