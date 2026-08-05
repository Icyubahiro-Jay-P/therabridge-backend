import express from "express";

// Per-route JSON body parser with an explicit size limit.
//
// The app used to rely on a single global express.json({ limit: "10kb" }).
// A global limit is wrong for two reasons:
//   1. It is shared by every route, so a limit sized for small payloads
//      (auth, settings) silently rejects legitimate large ones (a 2000-char
//      message of emoji/control chars can exceed 10kb once JSON-escaped).
//   2. It gives no room to tune each resource to its real contract.
//
// Each router mounts its own parser with a limit sized to the worst-case
// JSON encoding of its largest free-text field: JSON string escaping can
// blow a single character up to 6 bytes (\uXXXX), so the limit accounts for
// that plus JSON wrapping/overhead.
//
//   chat   → 16kb  (content max 2000 chars → 12kb worst case)
//   therry → 32kb  (content max 4000 chars → 24kb worst case)
//   crisis → 16kb  (description max 1000 chars → 6kb worst case)
//   exercise → 16kb (catalog create/update bodies with steps/instructions)
//   other  → 10kb  (small structured bodies)
//
// Validation always runs before encryption, so an oversized plaintext never
// reaches utils/crypto.js. Oversized bodies are rejected by this parser with
// a 413 (handled in middleware/error.middleware.js) before any Zod schema or
// controller runs.
export const jsonBody = (limit) => express.json({ limit });
