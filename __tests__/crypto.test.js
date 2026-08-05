import { describe, it, expect, afterEach } from "vitest";
import {
  encryptField,
  decryptField,
  encryptionEnabled,
} from "../utils/crypto.js";

const TEST_KEY = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

describe("field-level encryption (crypto.js)", () => {
  afterEach(() => {
    delete process.env.FIELD_ENCRYPTION_KEY;
  });

  it("reports encryption disabled without a key", () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(encryptionEnabled()).toBe(false);
  });

  it("reports encryption enabled with a 64-hex-char key", () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
    expect(encryptionEnabled()).toBe(true);
  });

  it("round-trips a value through encrypt/decrypt", () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
    const plain = "this is sensitive DM content";
    const envelope = encryptField(plain);
    expect(envelope.split(":")).toHaveLength(3);
    expect(decryptField(envelope)).toBe(plain);
  });

  it("produces a fresh non-deterministic envelope per call", () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
    const plain = "same input";
    expect(encryptField(plain)).not.toBe(encryptField(plain));
  });

  it("passes through empty values unchanged", () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
    expect(encryptField("")).toBe("");
    expect(encryptField(null)).toBeNull();
    expect(encryptField(undefined)).toBeUndefined();
    expect(decryptField("")).toBe("");
  });

  it("passes through legacy plaintext on decrypt", () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
    expect(decryptField("legacy plaintext without envelope")).toBe(
      "legacy plaintext without envelope",
    );
  });

  it("returns the raw value on tamper or wrong key instead of throwing", () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
    const envelope = encryptField("secret");
    process.env.FIELD_ENCRYPTION_KEY =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    expect(decryptField(envelope)).toBe(envelope);
  });

  it("degrades to plaintext (no key) outside production and hard-fails in prod", () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    process.env.NODE_ENV = "test";
    expect(encryptField("hello")).toBe("hello");

    process.env.NODE_ENV = "production";
    expect(() => encryptField("hello")).toThrow(/FIELD_ENCRYPTION_KEY/);
    process.env.NODE_ENV = "test";
  });
});
