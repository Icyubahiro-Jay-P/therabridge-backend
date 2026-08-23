import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import { createServer } from "http";
import { jsonBody } from "../middleware/jsonBody.js";
import { errorHandler } from "../middleware/error.middleware.js";
import {
  validate,
  registerSchema,
  sendMessageSchema,
  therryChatSchema,
  therryEditSchema,
  editCommunityMessageSchema,
  logMoodSchema,
  createCrisisSchema,
  updateProfileSchema,
  watermarkStampSchema,
  deleteProfileSchema,
} from "../utils/validation.js";

const TEST_KEY = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

describe("Zod schemas (plaintext caps match Mongoose)", () => {
  it("sendMessageSchema rejects content over 2000 chars", () => {
    const result = sendMessageSchema.safeParse({
      recipientId: "user456",
      content: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("sendMessageSchema accepts content at 2000 chars", () => {
    const result = sendMessageSchema.safeParse({
      recipientId: "user456",
      content: "a".repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it("therryChatSchema rejects messages over 4000 chars", () => {
    expect(therryChatSchema.safeParse({ message: "a".repeat(4001) }).success).toBe(false);
    expect(therryChatSchema.safeParse({ message: "a".repeat(4000) }).success).toBe(true);
  });

  it("therryEditSchema rejects content over 4000 chars", () => {
    expect(therryEditSchema.safeParse({ content: "a".repeat(4001) }).success).toBe(false);
  });

  it("editCommunityMessageSchema rejects content over 2000 chars", () => {
    expect(editCommunityMessageSchema.safeParse({ content: "a".repeat(2001) }).success).toBe(false);
  });

  it("logMoodSchema rejects note over 500 chars and more than 20 factors", () => {
    expect(logMoodSchema.safeParse({ mood: "good", note: "a".repeat(501) }).success).toBe(false);
    expect(
      logMoodSchema.safeParse({ mood: "good", factors: Array(21).fill("stress") }).success
    ).toBe(false);
    expect(
      logMoodSchema.safeParse({ mood: "good", factors: Array(20).fill("stress") }).success
    ).toBe(true);
  });

  it("createCrisisSchema rejects description over 1000 chars", () => {
    const result = createCrisisSchema.safeParse({
      alertType: "severe_distress",
      description: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("updateProfileSchema rejects bio over 300 chars", () => {
    expect(updateProfileSchema.safeParse({ bio: "a".repeat(301) }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ bio: "a".repeat(300) }).success).toBe(true);
  });

  it("watermarkStampSchema rejects text over 2000 chars", () => {
    expect(
      watermarkStampSchema.safeParse({ text: "a".repeat(2001), viewerId: "user123" }).success
    ).toBe(false);
  });

  it("deleteProfileSchema rejects username over 30 chars", () => {
    expect(deleteProfileSchema.safeParse({ username: "a".repeat(31) }).success).toBe(false);
  });
});

describe("validate middleware", () => {
  it("rejects oversized payloads with 400 VALIDATION_ERROR and never calls next", () => {
    const req = { body: { recipientId: "user456", content: "a".repeat(2001) } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    validate(sendMessageSchema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "VALIDATION_ERROR" }) })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("passes valid payloads through to next", () => {
    const req = { body: { recipientId: "user456", content: "hello" } };
    const res = { status: vi.fn(), json: vi.fn() };
    const next = vi.fn();

    validate(sendMessageSchema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("registerSchema (registration gate)", () => {
  const validBody = {
    firstName: "Test",
    lastName: "User",
    username: "testuser",
    email: "test@test.com",
    password: "password123",
    dateOfBirth: "2000-01-01",
  };

  function runValidation(body) {
    const req = { body };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();
    validate(registerSchema)(req, res, next);
    return { res, next };
  }

  it("rejects invalid email format with 400 before the controller runs", () => {
    const { res, next } = runValidation({ ...validBody, email: "notanemail" });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "VALIDATION_ERROR",
          message: expect.stringContaining("Invalid email format"),
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects underage users with 400 before the controller runs", () => {
    const { res, next } = runValidation({ ...validBody, dateOfBirth: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "VALIDATION_ERROR",
          message: expect.stringContaining("18 and 120 years old"),
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a fully valid registration body", () => {
    const { res, next } = runValidation(validBody);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("per-route JSON body limits", () => {
  async function startApp() {
    const app = express();
    app.use(jsonBody("16kb"));
    app.post("/route", (req, res) => {
      res.status(200).json({ ok: true, body: req.body });
    });
    app.use(errorHandler);

    const server = createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    return {
      baseUrl: `http://127.0.0.1:${port}`,
      close: () => new Promise((resolve) => server.close(resolve)),
    };
  }

  it("returns 413 PAYLOAD_TOO_LARGE for an oversized JSON body", async () => {
    const { baseUrl, close } = await startApp();
    try {
      const res = await fetch(`${baseUrl}/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // ~18kb of content, over the 16kb limit
        body: JSON.stringify({ content: "a".repeat(18000) }),
      });
      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data).toEqual(
        expect.objectContaining({ error: expect.objectContaining({ code: "PAYLOAD_TOO_LARGE" }) })
      );
    } finally {
      await close();
    }
  });

  it("accepts a body within the limit", async () => {
    const { baseUrl, close } = await startApp();
    try {
      const res = await fetch(`${baseUrl}/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "hello" }),
      });
      expect(res.status).toBe(200);
    } finally {
      await close();
    }
  });
});

describe("validation happens before encryption", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FIELD_ENCRYPTION_KEY;
  });

  it("does not reach the controller (encryptField) for oversized input", async () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
    const crypto = await import("../utils/crypto.js");
    const encryptSpy = vi.spyOn(crypto, "encryptField");

    const app = express();
    app.use(jsonBody("32kb"));
    app.post(
      "/therry",
      validate(therryChatSchema),
      (req, res) => {
        crypto.encryptField(req.body.message);
        res.status(201).json({ ok: true });
      },
    );
    app.use(errorHandler);

    const server = createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/therry`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "a".repeat(4001) }),
      });
      expect(res.status).toBe(400);
      expect(encryptSpy).not.toHaveBeenCalled();
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("decryptFieldLength (Mongoose plaintext caps)", () => {
  it("returns the plaintext length of an encrypted value, not the envelope", async () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
    const { encryptField, decryptFieldLength } = await import("../utils/crypto.js");
    const plain = "sensitive content";
    const envelope = encryptField(plain);
    expect(envelope.length).toBeGreaterThan(plain.length);
    expect(decryptFieldLength(envelope)).toBe(plain.length);
  });

  it("handles empty and legacy values without throwing", async () => {
    const { decryptFieldLength } = await import("../utils/crypto.js");
    expect(decryptFieldLength("")).toBe(0);
    expect(decryptFieldLength("legacy plaintext")).toBe("legacy plaintext".length);
  });
});
