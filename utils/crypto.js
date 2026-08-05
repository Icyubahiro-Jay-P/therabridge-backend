import crypto from "crypto";

// Field-level encryption at rest (AES-256-GCM).
//
// Sensitive user content (DMs, mood notes, crisis descriptions, Therry
// messages, notification previews, community messages) is encrypted before it
// is written to MongoDB and decrypted on read. The API contract is unchanged:
// controllers encrypt on write and decrypt on read, so clients always see
// plaintext while data at rest is ciphertext.
//
// Envelope format: "<iv>:<authTag>:<ciphertext>" - each part is base64url.
// A fresh 96-bit IV is generated per value, and GCM provides authenticated
// encryption (tamper detection).

const isConfiguredKey = (key) => {
  if (!key) return false;
  // Accept a 32-byte key as 64 hex chars (recommended) or a raw 32-byte string.
  if (/^[0-9a-fA-F]{64}$/.test(key)) return true;
  return Buffer.byteLength(key, "utf8") === 32;
};

const getKey = () => {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!isConfiguredKey(key)) return null;
  if (/^[0-9a-fA-F]{64}$/.test(key)) return Buffer.from(key, "hex");
  return Buffer.from(key, "utf8");
};

export const encryptionEnabled = () => !!getKey();

let warnedMissingKey = false;
const warnMissingKey = () => {
  if (!warnedMissingKey) {
    warnedMissingKey = true;
    console.warn(
      "[crypto] FIELD_ENCRYPTION_KEY is not configured; sensitive fields are not encrypted at rest.",
    );
  }
};

export const encryptField = (plain) => {
  if (plain == null || plain === "") return plain;
  const key = getKey();
  if (!key) {
    // Fail loudly in production so a misconfigured deployment never silently
    // stores plaintext; in dev/test, degrade to plaintext with a warning so
    // local runs and unit tests keep working without a key.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FIELD_ENCRYPTION_KEY is not configured; cannot encrypt sensitive fields.",
      );
    }
    warnMissingKey();
    return plain;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plain), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64url")}:${authTag.toString("base64url")}:${ciphertext.toString("base64url")}`;
};

export const decryptField = (envelope) => {
  if (envelope == null || envelope === "") return envelope;
  // Legacy plaintext (pre-migration) has no 3-part envelope; return as-is so
  // reads keep working during a gradual migration.
  const parts = envelope.split(":");
  if (parts.length !== 3) return envelope;
  const key = getKey();
  if (!key) return envelope;
  try {
    const [iv, authTag, data] = parts;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(authTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    // Tampered value or wrong key. Return the raw value rather than crashing
    // reads; the value is either ciphertext (safe to expose) or legacy text.
    return envelope;
  }
};
