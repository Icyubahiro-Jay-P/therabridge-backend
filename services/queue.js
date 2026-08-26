import { Queue, Worker } from "bullmq";
import { redis } from "./cache.js";
import logger from "../utils/logger.js";

// Shared connection for BullMQ — uses the same Redis instance as caching.
// BullMQ requires `maxRetriesPerRequest: null` which is set in cache.js.
const connection = redis;

// ====================== QUEUES ======================

export const auditQueue = new Queue("audit", { connection });
export const notificationQueue = new Queue("notifications", { connection });
export const moodCheckinQueue = new Queue("mood-checkin", { connection });
export const retentionQueue = new Queue("retention", { connection });

// ====================== WORKER HELPERS ======================

const defaultWorkerOpts = {
  connection,
  removeOnComplete: { count: 1000, age: 86400 },
  removeOnFail: { count: 500, age: 86400 },
};

export const createWorker = (name, processor) => {
  const worker = new Worker(name, processor, defaultWorkerOpts);

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id, queue: name }, "Job failed");
  });

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id, queue: name }, "Job completed");
  });

  return worker;
};

// ====================== DELAYED JOBS ======================

export const scheduleRetentionPurge = async () => {
  try {
    await retentionQueue.add(
      "purge-old-data",
      {},
      {
        repeat: { cron: "0 3 * * *" }, // 3 AM daily
        removeOnComplete: true,
        removeOnFail: { count: 10 },
      },
    );
    logger.info("Data retention purge job scheduled (daily at 3 AM)");
  } catch (err) {
    logger.error({ err }, "Failed to schedule retention purge");
  }
};
