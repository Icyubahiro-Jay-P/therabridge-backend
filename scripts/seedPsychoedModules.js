import mongoose from "mongoose"
import "dotenv/config"
import { connectDB } from "./db/connectDB.js"
import { PsychoedModule } from "./models/psychoedModule.model.js"
import logger from "./utils/logger.js"
import { modules } from "./psychoedModuleSeedData.js"

async function seed() {
  try {
    await connectDB()
    logger.info("Connected to database")

    const count = await PsychoedModule.countDocuments()
    if (count > 0) {
      logger.info(`Database already has ${count} modules. Clearing and re-seeding...`)
      await PsychoedModule.deleteMany({})
    }

    const result = await PsychoedModule.insertMany(modules)
    logger.info(`Seeded ${result.length} psychoeducation modules`)

    for (const mod of result) {
      logger.info(`  - ${mod.title} (${mod.steps.length} steps)`)
    }

    process.exit(0)
  } catch (err) {
    logger.error({ err }, "Failed to seed modules")
    process.exit(1)
  }
}

seed()
