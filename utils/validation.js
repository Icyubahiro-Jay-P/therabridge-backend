import { z } from "zod"

export const registerSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters").max(50),
  lastName: z.string().min(2, "Last name must be at least 2 characters").max(50),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, "Username: letters, numbers, underscores only"),
  email: z.string().email("Invalid email format").max(254, "Email is too long"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password is too long"),
  dateOfBirth: z.string().refine(
    (val) => {
      const date = new Date(val)
      if (isNaN(date.getTime())) return false
      const today = new Date()
      let age = today.getFullYear() - date.getFullYear()
      const mDiff = today.getMonth() - date.getMonth()
      if (mDiff < 0 || (mDiff === 0 && today.getDate() < date.getDate())) age--
      return age >= 18 && age <= 120
    },
    { message: "Must be between 18 and 120 years old" },
  ),
})

export const loginSchema = z.object({
  identifier: z.string().min(1, "Email or username is required").max(254),
  password: z.string().min(1, "Password is required"),
})

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(2).max(50).optional(),
  lastName: z.string().trim().min(2).max(50).optional(),
  dateOfBirth: z
    .string()
    .refine(
      (val) => {
        const date = new Date(val)
        if (isNaN(date.getTime())) return false
        const today = new Date()
        let age = today.getFullYear() - date.getFullYear()
        const mDiff = today.getMonth() - date.getMonth()
        if (mDiff < 0 || (mDiff === 0 && today.getDate() < date.getDate())) age--
        return age >= 18 && age <= 120
      },
      { message: "Must be between 18 and 120" },
    )
    .optional(),
  bio: z.string().trim().max(300).optional(),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(128),
})

export const sendMessageSchema = z.object({
  recipientId: z.string().min(1, "Recipient is required"),
  content: z.string().min(1, "Message cannot be empty").max(2000),
})

export const createCommunitySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(60),
  description: z.string().max(200).optional(),
  category: z
    .enum([
      "general",
      "anxiety",
      "depression",
      "stress",
      "mindfulness",
      "support",
      "therapy",
      "wellness",
    ])
    .optional(),
  isPrivate: z.boolean().optional(),
  rules: z.string().max(500).optional(),
})

export const inviteMemberSchema = z.object({
  userId: z.string().min(1, "User is required"),
})

export const moderateRequestSchema = z.object({
  action: z.enum(["approve", "reject"]),
})

export const assignTherapistSchema = z.object({
  userId: z.string().min(1, "User is required"),
  therapistId: z.string().nullable().optional(),
})

export const logMoodSchema = z.object({
  mood: z.enum(["great", "good", "okay", "bad", "terrible"]),
  note: z.string().max(500).optional(),
  factors: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  intensity: z.number().int().min(1).max(10).optional(),
})

export const createCrisisSchema = z.object({
  alertType: z.enum(["immediate_danger", "severe_distress", "panic_attack", "self_harm_thoughts", "emergency"]),
  description: z.string().max(1000).optional(),
  severity: z.enum(["mild", "medium", "severe"]).optional(),
  requestContact: z.boolean().optional(),
})

export const updateCrisisLogSchema = z.object({
  actionTaken: z.enum(["none", "hotlines_shown", "crisis_alert_created", "therapist_messaged"]),
})

export const safetyPlanListSchema = z
  .array(z.string().trim().min(1, "Items cannot be empty").max(120, "Items must be at most 120 characters"))
  .max(10, "At most 10 items per section")
  .optional()

export const safetyPlanSchema = z.object({
  warningSigns: safetyPlanListSchema,
  internalCoping: safetyPlanListSchema,
  distractionPeople: safetyPlanListSchema,
  distractionSettings: safetyPlanListSchema,
  helpPeople: safetyPlanListSchema,
  professionals: safetyPlanListSchema,
  meansRestriction: safetyPlanListSchema,
  reasonsForLiving: safetyPlanListSchema,
})

export const createExerciseSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  duration: z.number().positive(),
  type: z.enum(["breathing", "mindfulness", "gratitude", "movement", "grounding"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  steps: z
    .array(
      z.object({
        instruction: z.string().min(1),
        duration: z.number().positive(),
      }),
    )
    .optional(),
  color: z.string().optional(),
})

export const privacySettingsSchema = z.object({
  privacySettings: z.object({
    firstName: z.enum(["public", "private"]).optional(),
    lastName: z.enum(["public", "private"]).optional(),
    email: z.enum(["public", "private"]).optional(),
    dateOfBirth: z.enum(["public", "private"]).optional(),
    bio: z.enum(["public", "private"]).optional(),
  }),
})

export const chatSettingsSchema = z.object({
  chatSettings: z.object({
    readReceipts: z.boolean().optional(),
  }),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email("Valid email is required"),
})

export const verifyEmailSchema = z.object({
  code: z
    .string()
    .regex(/^\d{6}$/, "Enter the 6-digit verification code from your email"),
})

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password is too long"),
})

export const removeMemberSchema = z.object({
  userId: z.string().min(1),
})

export const editMessageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(2000),
})

export const joinCommunitySchema = z.object({
  inviteKey: z.string().min(1, "Invite key is required"),
})

export const sendCommunityMessageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(2000),
})

export const editCommunityMessageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(2000),
})

export const therryChatSchema = z.object({
  message: z.string().min(1, "Message cannot be empty").max(4000, "Message is too long (maximum 4000 characters)"),
})

export const therryEditSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(4000, "Message is too long (maximum 4000 characters)"),
})

export const screenshotNoticeSchema = z.object({
  recipientId: z.string().min(1, "Recipient is required").max(24),
})

export const watermarkStampSchema = z.object({
  text: z.string().min(1, "text is required").max(2000),
  viewerId: z.string().min(1, "viewerId is required").max(64),
})

export const deleteProfileSchema = z.object({
  username: z.string().min(1, "Username is required").max(30),
})

export const updateCommunitySchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(200).optional(),
  category: z.enum([
    "general", "anxiety", "depression", "stress",
    "mindfulness", "support", "therapy", "wellness",
  ]).optional(),
  rules: z.string().max(500).optional(),
  isPrivate: z.boolean().optional(),
})

export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    const messages = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    )
    return res.status(400).json({ error: { message: messages.join("; "), code: "VALIDATION_ERROR" } })
  }
  req.body = result.data
  next()
}
