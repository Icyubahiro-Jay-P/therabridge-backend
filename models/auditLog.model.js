import mongoose from "mongoose";

// Immutable audit trail for privacy-sensitive access (admin/therapist views of
// user data and crisis records) so access to protected information is
// accountable. Retained per the retention policy and anonymized on deletion
// instead of being destroyed, preserving the trail.
const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorRole: {
      type: String,
      enum: ["user", "admin", "therapist", "system"],
      default: "user",
    },
    action: {
      type: String,
      enum: [
        "user_profile_view",
        "client_roster_view",
        "crisis_view",
        "data_export",
        "account_deletion",
        "ai_disclosure_ack",
      ],
      required: true,
    },
    targetType: {
      type: String,
      enum: ["user", "crisis", "therry_message", "audit_log"],
      default: "user",
    },
    target: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    detail: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ target: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
