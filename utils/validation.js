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
  replyToMessageId: z.string().optional(),
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

export const resendVerificationSchema = z.object({
  email: z.string().email("Valid email is required"),
})

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password is too long"),
})

export const editMessageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(2000),
})

export const joinCommunitySchema = z.object({
  inviteKey: z.string().min(1, "Invite key is required"),
})

export const sendCommunityMessageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(2000),
  replyToMessageId: z.string().optional(),
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

export const verifyTwoFactorSetupSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
})

export const validateTwoFactorSchema = z.object({
  code: z.string().min(1, "Code is required"),
})

export const disableTwoFactorSchema = z.object({
  password: z.string().min(1, "Password is required to disable 2FA"),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
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

export const createJournalEntrySchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  content: z.string().min(1, "Content is required").max(5000),
  mood: z.enum(["great", "good", "okay", "bad", "terrible"]).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  isPublic: z.boolean().optional(),
})

export const updateJournalEntrySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(5000).optional(),
  mood: z.enum(["great", "good", "okay", "bad", "terrible"]).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  isPublic: z.boolean().optional(),
})

export const addCommentSchema = z.object({
  content: z.string().min(1, "Comment cannot be empty").max(1000),
})

export const createThoughtRecordSchema = z.object({
  situation: z.string().min(1, "Situation is required").max(500),
  automaticThought: z.string().min(1, "Automatic thought is required").max(500),
  emotions: z.string().min(1, "Emotions are required").max(300),
  emotionIntensity: z.number().int().min(1).max(10),
  distortionType: z.enum([
    "all_or_nothing", "overgeneralization", "mental_filter",
    "disqualifying_positive", "mind_reading", "fortune_telling",
    "magnification", "minimization", "emotional_reasoning",
    "should_statements", "labeling", "personalization", "none",
  ]).optional(),
  evidenceFor: z.string().max(500).optional(),
  evidenceAgainst: z.string().max(500).optional(),
  reframe: z.string().min(1, "Reframe is required").max(500),
  outcomeEmotion: z.string().max(300).optional(),
  outcomeIntensity: z.number().int().min(1).max(10).optional(),
  mood: z.enum(["great", "good", "okay", "bad", "terrible"]).optional(),
})

export const updateThoughtRecordSchema = z.object({
  situation: z.string().min(1).max(500).optional(),
  automaticThought: z.string().min(1).max(500).optional(),
  emotions: z.string().min(1).max(300).optional(),
  emotionIntensity: z.number().int().min(1).max(10).optional(),
  distortionType: z.enum([
    "all_or_nothing", "overgeneralization", "mental_filter",
    "disqualifying_positive", "mind_reading", "fortune_telling",
    "magnification", "minimization", "emotional_reasoning",
    "should_statements", "labeling", "personalization", "none",
  ]).optional(),
  evidenceFor: z.string().max(500).optional(),
  evidenceAgainst: z.string().max(500).optional(),
  reframe: z.string().min(1).max(500).optional(),
  outcomeEmotion: z.string().max(300).optional(),
  outcomeIntensity: z.number().int().min(1).max(10).optional(),
  mood: z.enum(["great", "good", "okay", "bad", "terrible"]).nullable().optional(),
})

export const takeAssessmentSchema = z.object({
  type: z.enum(["phq9", "gad7", "pss", "k10"]),
  responses: z.array(z.object({
    questionIndex: z.number().int().min(0),
    value: z.number().int().min(0).max(3),
  })).min(1),
})

export const createGratitudeEntrySchema = z.object({
  promptId: z.string().min(1).max(10),
  promptText: z.string().min(1).max(200),
  content: z.string().min(1, "Content is required").max(1000),
})

export const createActivitySchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  category: z.enum(["social", "physical", "creative", "productive", "relaxation", "outdoor", "learning", "self_care", "other"]),
  scheduledDate: z.string().min(1, "Date is required"),
  scheduledTime: z.string().max(10).optional(),
  duration: z.number().min(0).optional(),
  expectedPleasure: z.number().int().min(1).max(10),
  moodBefore: z.enum(["great", "good", "okay", "bad", "terrible"]).optional(),
  notes: z.string().max(500).optional(),
})

export const completeActivitySchema = z.object({
  actualPleasure: z.number().int().min(1).max(10).optional(),
  moodAfter: z.enum(["great", "good", "okay", "bad", "terrible"]).optional(),
  notes: z.string().max(500).optional(),
})

export const createCopingCardSchema = z.object({
  text: z.string().min(1, "Card text is required").max(300),
  category: z.enum([
    "anxiety_coping", "self_compassion", "motivation",
    "crisis_survival", "gratitude", "encouragement", "custom",
  ]),
})

export const createMedicationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  dosage: z.string().min(1, "Dosage is required").max(50),
  frequency: z.enum(["daily", "twice_daily", "three_times", "weekly", "as_needed"]),
  timeOfDay: z.string().optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
  notes: z.string().max(200).optional().nullable(),
})

export const updateMedicationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  dosage: z.string().min(1).max(50).optional(),
  frequency: z.enum(["daily", "twice_daily", "three_times", "weekly", "as_needed"]).optional(),
  timeOfDay: z.string().optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
  active: z.boolean().optional(),
  notes: z.string().max(200).optional().nullable(),
})

export const logDoseSchema = z.object({
  medicationId: z.string().min(1, "Medication is required"),
  takenAt: z.string().optional(),
  skipped: z.boolean().optional(),
  sideEffects: z.array(z.string().max(100)).max(10).optional(),
  notes: z.string().max(200).optional(),
})

export const logSleepSchema = z.object({
  date: z.string().optional(),
  quality: z.number().int().min(1).max(5),
  bedtime: z.string().max(10).optional(),
  wakeTime: z.string().max(10).optional(),
  hoursSlept: z.number().min(0).max(24).optional(),
  notes: z.string().max(500).optional(),
  dreams: z.string().max(500).optional(),
})

export const createHabitSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  emoji: z.string().min(1).max(8).optional(),
  color: z.enum(["emerald", "sky", "violet", "amber", "rose", "teal"]).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Reminder must be HH:mm")
    .nullable()
    .optional(),
})

export const updateHabitSchema = createHabitSchema
  .partial()
  .extend({ active: z.boolean().optional() })

export const toggleHabitSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
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
