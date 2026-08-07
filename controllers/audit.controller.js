import AuditLog from "../models/auditLog.model.js";
import {
  getPaginationParams,
  formatPaginatedResponse,
  parseSortParams,
} from "../utils/pagination.js";

// Admin-only read of the privacy audit trail. Filters support narrowing by
// action, actor, target, and date range.
export const getAuditLogs = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query, 50);
    const sort = parseSortParams(req.query, ["createdAt"]);

    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.actorId) filter.actor = req.query.actorId;
    if (req.query.targetId) filter.target = req.query.targetId;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }

    const total = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .populate("actor", "username firstName lastName role")
      .populate("target", "username firstName lastName role");

    res.status(200).json(formatPaginatedResponse(logs, total, page, limit));
  } catch (error) {
    throw error;
  }
};
