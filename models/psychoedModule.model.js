import mongoose from "mongoose"

const stepSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    duration: { type: Number, default: 5 },
  },
  { _id: false },
)

const psychoedModuleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ["cbt", "anxiety", "depression", "stress", "sleep", "relationships"],
      required: true,
    },
    steps: {
      type: [stepSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1,
        message: "Module must have at least one step",
      },
    },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
)

const userProgressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    module: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PsychoedModule",
      required: true,
    },
    currentStepIndex: { type: Number, default: 0 },
    completedSteps: { type: [Number], default: [] },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    startedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

userProgressSchema.index({ user: 1, module: 1 }, { unique: true })
userProgressSchema.index({ user: 1, completed: 1 })

psychoedModuleSchema.index({ category: 1, order: 1 })

export const PsychoedModule = mongoose.model("PsychoedModule", psychoedModuleSchema)
export const PsychoedProgress = mongoose.model("PsychoedProgress", userProgressSchema)
