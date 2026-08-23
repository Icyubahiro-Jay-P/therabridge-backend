// Canonical error shape: { error: { message, code, category } }.
export const forbidden = (res, message) =>
  res.status(403).json({ error: { message, code: "FORBIDDEN", category: "USER" } });

export const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return forbidden(res, "Only admins can perform this action.");
  }
  next();
};

export const requireTherapist = (req, res, next) => {
  if (req.user.role !== "therapist") {
    return forbidden(res, "Only therapists can perform this action.");
  }
  next();
};

export const requireAdminOrTherapist = (req, res, next) => {
  if (req.user.role !== "admin" && req.user.role !== "therapist") {
    return forbidden(res, "Access denied.");
  }
  next();
};
