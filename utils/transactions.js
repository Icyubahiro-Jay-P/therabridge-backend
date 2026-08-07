import mongoose from "mongoose";
import logger from "./logger.js";

// Multi-document transactions for writes that touch more than one collection.
// A crash mid-sequence must never leave data half-updated (e.g. a crisis log
// written but the crisis alert lost).
//
// MongoDB transactions require a replica set (Atlas is one by default). On a
// standalone single-node Mongo (typical local dev) they aren't supported, so
// we fall back to sequential writes with a one-time warning. All multi-step
// write paths should route through `withTransaction`.
let warnedFallback = false;

const isUnsupportedError = (err) => {
  const msg = String(err?.message || err);
  return (
    /transaction numbers are only allowed on a replica set member/i.test(msg) ||
    /standalone.*transaction|transaction.*standalone/i.test(msg) ||
    /not supported.*transaction|transaction.*not supported/i.test(msg) ||
    /session may not be used/i.test(msg)
  );
};

export const withTransaction = async (fn) => {
  try {
    return await mongoose.connection.transaction(fn);
  } catch (err) {
    if (isUnsupportedError(err)) {
      if (!warnedFallback) {
        warnedFallback = true;
        logger.warn(
          "MongoDB does not support transactions (standalone node?). Multi-step writes will run sequentially and are NOT atomic. Use a replica set (Atlas) for production.",
        );
      }
      return fn(null);
    }
    throw err;
  }
};

export default withTransaction;
