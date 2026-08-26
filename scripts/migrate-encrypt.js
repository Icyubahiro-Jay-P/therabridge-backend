import mongoose from "mongoose";
import dotenv from "dotenv";
import { encryptField, encryptionEnabled } from "../utils/crypto.js";
import { Message, Community } from "../models/chat.model.js";
import Mood from "../models/mood.model.js";
import Crisis from "../models/crisis.model.js";
import { TherryMessage } from "../models/therryMessage.model.js";
import Notification from "../models/notification.model.js";

dotenv.config();

// One-time backfill: encrypt any plaintext sensitive fields left over from
// before field-level encryption was enabled.
//
//   npm run migrate:encrypt
//
// Safe to re-run (already-encrypted envelopes are skipped). Run it BEFORE
// deploying the decrypt-on-read changes so no plaintext values are exposed
// after the feature ships. Requires FIELD_ENCRYPTION_KEY to be set.

const isPlaintext = (value) => value && value.split(":").length !== 3;

const batch = async (Model, filter, update, label) => {
  const count = await Model.countDocuments(filter);
  if (count === 0) {
    console.log(`  ${label}: nothing to migrate`);
    return;
  }
  console.log(`  ${label}: migrating ${count} document(s)...`);
  let updated = 0;
  const cursor = Model.find(filter).cursor();
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    if (update(doc)) {
      await doc.save();
      updated += 1;
    }
  }
  console.log(`  ${label}: done (${updated} updated)`);
};

const migrateMessages = async () => {
  await batch(
    Message,
    { $or: [{ content: { $regex: /^[^:]+$/ } }, { content: "" }] },
    (doc) => {
      if (!isPlaintext(doc.content)) return false;
      doc.content = encryptField(doc.content);
      return true;
    },
    "Messages",
  );
};

const migrateMoods = async () => {
  await batch(
    Mood,
    { $or: [{ note: { $regex: /^[^:]+$/ } }, { note: "" }] },
    (doc) => {
      if (!isPlaintext(doc.note)) return false;
      doc.note = encryptField(doc.note);
      return true;
    },
    "Moods",
  );
};

const migrateCrises = async () => {
  await batch(
    Crisis,
    { $or: [{ description: { $regex: /^[^:]+$/ } }, { description: "" }] },
    (doc) => {
      if (!isPlaintext(doc.description)) return false;
      doc.description = encryptField(doc.description);
      return true;
    },
    "Crises",
  );
};

const migrateTherryMessages = async () => {
  await batch(
    TherryMessage,
    { $or: [{ content: { $regex: /^[^:]+$/ } }, { content: "" }] },
    (doc) => {
      let changed = false;
      if (isPlaintext(doc.content)) {
        doc.content = encryptField(doc.content);
        changed = true;
      }
      if (Array.isArray(doc.editHistory)) {
        doc.editHistory = doc.editHistory.map((entry) => {
          if (isPlaintext(entry.content)) {
            entry.content = encryptField(entry.content);
            changed = true;
          }
          return entry;
        });
      }
      return changed;
    },
    "Therry messages",
  );
};

const migrateNotifications = async () => {
  await batch(
    Notification,
    { $or: [{ body: { $regex: /^[^:]+$/ } }, { body: "" }] },
    (doc) => {
      if (!isPlaintext(doc.body)) return false;
      doc.body = encryptField(doc.body);
      return true;
    },
    "Notifications",
  );
};

const migrateCommunities = async () => {
  await batch(
    Community,
    { "messages.content": { $regex: /^[^:]+$/ } },
    (doc) => {
      let changed = false;
      if (Array.isArray(doc.messages)) {
        doc.messages = doc.messages.map((msg) => {
          if (isPlaintext(msg.content)) {
            msg.content = encryptField(msg.content);
            changed = true;
          }
          return msg;
        });
      }
      return changed;
    },
    "Community messages",
  );
};

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Encryption enabled: ${encryptionEnabled()}`);
    if (!encryptionEnabled()) {
      console.error("Aborting: FIELD_ENCRYPTION_KEY is not configured.");
      process.exit(1);
    }
    console.log("Backfilling existing plaintext fields...\n");
    await migrateMessages();
    await migrateMoods();
    await migrateCrises();
    await migrateTherryMessages();
    await migrateNotifications();
    await migrateCommunities();
    console.log("\nMigration complete.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
