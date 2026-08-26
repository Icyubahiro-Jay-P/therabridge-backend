import { createWorker } from "../services/queue.js";
import { processAuditJob } from "../services/audit.service.js";
import { processNotificationJob } from "../services/notification.service.js";
import { processMoodCheckinJob } from "../services/moodCheckin.service.js";
import AuditLog from "../models/auditLog.model.js";
import Notification from "../models/notification.model.js";
import logger from "../utils/logger.js";

const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

export const startWorkers = () => {
  createWorker("audit", processAuditJob);
  createWorker("notifications", processNotificationJob);
  createWorker("mood-checkin", processMoodCheckinJob);

  // Data retention purge worker
  createWorker("retention", async () => {
    const cutoff = new Date(Date.now() - SIX_MONTHS_MS);

    try {
      const auditResult = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
      logger.info({ deleted: auditResult.deletedCount }, "Audit logs older than 6 months purged");
    } catch (err) {
      logger.error({ err }, "Failed to purge old audit logs");
    }

    try {
      const notifResult = await Notification.deleteMany({ createdAt: { $lt: cutoff } });
      logger.info({ deleted: notifResult.deletedCount }, "Notifications older than 6 months purged");
    } catch (err) {
      logger.error({ err }, "Failed to purge old notifications");
    }
  });

  logger.info("BullMQ workers started (audit, notifications, mood-checkin, retention)");
};
