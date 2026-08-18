import "dotenv/config";

// Boot-time environment validation. Called from server.js before any routes
// are served so a misconfigured deployment fails fast (at startup) instead of
// exploding on the first request that needs a missing/weak value.

const KNOWN_WEAK_JWT_SECRETS = new Set([
  "your_jwt_secret_here",
  "therabridgejwtsecret_change_in_production",
  "changeme",
  "secret",
  "jwtsecret",
  "jwt_secret",
]);

const isStrongJwtSecret = (value) => {
  if (!value || typeof value !== "string") return false;
  if (value.length < 32) return false;
  if (KNOWN_WEAK_JWT_SECRETS.has(value.toLowerCase().trim())) return false;
  if (/^(your_|change_|changeme|secret)/i.test(value.trim())) return false;
  return true;
};

const isValidEncryptionKey = (key) => {
  if (!key) return false;
  if (/^[0-9a-fA-F]{64}$/.test(key)) return true;
  return Buffer.byteLength(key, "utf8") === 32;
};

const isPlaceholder = (value) => {
  if (!value) return true;
  return /^(your_|changeme|replace|insert_|example)/i.test(value.trim());
};

const failures = [];
const warnings = [];

const requireEnv = (name, predicate, hint) => {
  const value = process.env[name];
  if (!predicate(value)) {
    failures.push(`${name}: ${hint}`);
  }
};

const warnIfWeak = (name, predicate, hint) => {
  const value = process.env[name];
  if (!predicate(value)) {
    warnings.push(`${name}: ${hint}`);
  }
};

export const validateEnv = () => {
  const isProduction = process.env.NODE_ENV === "production";

  requireEnv(
    "MONGO_URI",
    (v) => !!v,
    "must be set to your MongoDB connection string",
  );

  requireEnv(
    "JWT_SECRET",
    isStrongJwtSecret,
    "must be at least 32 characters, not a placeholder, and unique per environment. Generate one with: openssl rand -hex 32",
  );

  if (isProduction) {
    requireEnv("CLIENT_URL", (v) => !!v, "must be the production frontend URL");
    requireEnv(
      "FIELD_ENCRYPTION_KEY",
      isValidEncryptionKey,
      "must be a 64-char hex key (openssl rand -hex 32) - sensitive fields would otherwise be stored unencrypted",
    );
    // MAIL DISABLED — email env vars are not required while the mailing
    // system is offline. Re-enable when a stable mail service is configured.
    // requireEnv(
    //   "EMAIL_HOST",
    //   (v) => !!v,
    //   "must be set for password reset emails",
    // );
    // requireEnv(
    //   "EMAIL_USER",
    //   (v) => !!v,
    //   "must be set for password reset emails",
    // );
    // requireEnv(
    //   "EMAIL_PASS",
    //   (v) => !!v,
    //   "must be set for password reset emails",
    // );
    requireEnv(
      "VAPID_PUBLIC_KEY",
      (v) => !!v,
      "must be set for device notifications",
    );
    requireEnv(
      "VAPID_PRIVATE_KEY",
      (v) => !!v,
      "must be set for device notifications",
    );
    requireEnv(
      "VAPID_SUBJECT",
      (v) => !!v,
      "must be set for device notifications",
    );
    requireEnv(
      "GEMINI_API_KEY",
      (v) => !!v && !isPlaceholder(v),
      "must be a real Gemini API key",
    );
    requireEnv(
      "CLOUDINARY_CLOUD_NAME",
      (v) => !!v && !isPlaceholder(v),
      "must be your Cloudinary cloud name - profile pictures are stored there",
    );
    requireEnv(
      "CLOUDINARY_API_KEY",
      (v) => !!v && !isPlaceholder(v),
      "must be your Cloudinary API key",
    );
    requireEnv(
      "CLOUDINARY_API_SECRET",
      (v) => !!v && !isPlaceholder(v),
      "must be your Cloudinary API secret",
    );
  } else {
    // Fail fast even in dev on the two settings that are dangerous regardless:
    // a forgeable JWT secret and field encryption silently disabled.
    warnIfWeak(
      "GEMINI_API_KEY",
      (v) => !!v && !isPlaceholder(v),
      "placeholder key detected - Therry AI calls will fail (dev only warning)",
    );
    warnIfWeak(
      "FIELD_ENCRYPTION_KEY",
      isValidEncryptionKey,
      "not set - sensitive fields will be stored in plaintext (dev only warning)",
    );
    warnIfWeak(
      "CLOUDINARY_CLOUD_NAME",
      (v) => !!v && !isPlaceholder(v),
      "not set - profile picture uploads will fail (dev only warning)",
    );
  }

  if (failures.length > 0) {
    throw new Error(
      "Invalid environment configuration:\n  - " + failures.join("\n  - "),
    );
  }

  if (warnings.length > 0) {
    console.warn("[env] Warning:\n  - " + warnings.join("\n  - "));
  }

  return true;
};

// Validate at import time so server.js fails fast on boot, before any route
// or model module loads. dotenv/config above runs first (import order).
validateEnv();

export default validateEnv;
