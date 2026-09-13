import mongoose from "mongoose";
import dotenv from "dotenv";
import { CommunityMessage } from "../models/communityMessage.model.js";

dotenv.config();

// One-time migration: move each Community's embedded `messages` subdocument
// array (the old storage design - an unbounded array that could eventually
// hit MongoDB's 16MB document limit) into its own document in the new
// CommunityMessage collection, preserving original _ids, then unset the
// (now removed from the schema) `messages` field on the source document.
//
//   npm run migrate:community-messages
//
// Take a database backup first - this is a one-way structural move. Safe to
// re-run: a community whose messages already exist in the new collection is
// detected via duplicate-key errors on insert and just has its embedded
// field cleared. Run this BEFORE relying on community messaging in
// production - the app's controllers only read/write the new collection,
// so any embedded messages left un-migrated are simply invisible to it.

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    // Read the raw collection directly (not through the Community model,
    // whose schema no longer declares `messages`) so any not-yet-migrated
    // embedded arrays are still visible regardless of app-level schema state.
    const raw = mongoose.connection.collection("communities");
    const cursor = raw.find(
      { messages: { $exists: true, $not: { $size: 0 } } },
      { projection: { messages: 1 } },
    );

    let communitiesMigrated = 0;
    let messagesMigrated = 0;

    for await (const doc of cursor) {
      const embedded = Array.isArray(doc.messages) ? doc.messages : [];
      if (embedded.length === 0) continue;

      const toInsert = embedded.map((msg) => ({
        _id: msg._id,
        community: doc._id,
        sender: msg.sender,
        type: msg.type ?? "text",
        content: msg.content,
        audioUrl: msg.audioUrl ?? null,
        duration: msg.duration ?? null,
        replyTo: msg.replyTo,
        readBy: msg.readBy ?? [],
        unsent: msg.unsent ?? false,
        edited: msg.edited ?? false,
        editCount: msg.editCount ?? 0,
        editHistory: msg.editHistory ?? [],
        createdAt: msg.createdAt ?? new Date(),
        updatedAt: msg.createdAt ?? new Date(),
      }));

      try {
        await CommunityMessage.insertMany(toInsert, { ordered: false });
      } catch (err) {
        const isDuplicateOnly =
          err.code === 11000 ||
          (Array.isArray(err.writeErrors) &&
            err.writeErrors.every((e) => e.code === 11000));
        if (!isDuplicateOnly) throw err;
        console.log(`  ${doc._id}: already migrated (duplicate _ids), skipping insert`);
      }

      await raw.updateOne({ _id: doc._id }, { $unset: { messages: "" } });

      communitiesMigrated += 1;
      messagesMigrated += embedded.length;
      console.log(`  ${doc._id}: migrated ${embedded.length} message(s)`);
    }

    if (communitiesMigrated === 0) {
      console.log("Nothing to migrate - no communities have embedded messages left.");
    } else {
      console.log(
        `\nDone: ${messagesMigrated} message(s) across ${communitiesMigrated} communit${communitiesMigrated === 1 ? "y" : "ies"} migrated.`,
      );
    }
  } catch (err) {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
