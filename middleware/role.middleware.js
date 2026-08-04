export const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Only admins can perform this action." });
  }
  next();
};

export const requireTherapist = (req, res, next) => {
  if (req.user.role !== "therapist") {
    return res.status(403).json({ message: "Only therapists can perform this action." });
  }
  next();
};

export const requireAdminOrTherapist = (req, res, next) => {
  if (req.user.role !== "admin" && req.user.role !== "therapist") {
    return res.status(403).json({ message: "Access denied." });
  }
  next();
};
