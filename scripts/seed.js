import { seedPrograms } from "../controllers/program.controller.js";
import { seedSleepContent } from "../controllers/sleep.controller.js";
import { connectDB } from "../db/connectDB.js";
import logger from "../utils/logger.js";

await connectDB();
logger.info("Running seed scripts...");

try {
  await seedPrograms();
  await seedSleepContent();
  logger.info("Seed scripts completed successfully");
} catch (err) {
  logger.error({ err }, "Seed scripts failed");
}

process.exit(0);
