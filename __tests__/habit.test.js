import { describe, it, expect, vi, beforeEach } from "vitest";

const habitInstances = [];

vi.mock("../models/user.model.js", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("../models/habit.model.js", () => {
  function HabitMock(data) {
    Object.assign(this, data);
    habitInstances.push(this);
  }
  HabitMock.prototype.save = vi.fn(async function () {
    return this;
  });
  HabitMock.prototype.toObject = function () {
    return { ...this };
  };
  HabitMock.find = vi.fn();
  HabitMock.findOne = vi.fn();
  HabitMock.findOneAndDelete = vi.fn();

  function HabitLogMock(data) {
    Object.assign(this, data);
  }
  HabitLogMock.prototype.deleteOne = vi.fn();
  HabitLogMock.create = vi.fn();
  HabitLogMock.findOne = vi.fn();
  HabitLogMock.find = vi.fn();
  HabitLogMock.aggregate = vi.fn();

  return {
    HABIT_COLORS: ["emerald", "sky", "violet", "amber", "rose", "teal"],
    Habit: HabitMock,
    HabitLog: HabitLogMock,
  };
});

vi.mock("../models/pet.model.js", () => ({
  default: { findOne: vi.fn(), create: vi.fn() },
}));

vi.mock("../utils/crypto.js", () => ({
  encryptField: (v) => (v == null || v === "" ? v : `enc:${v}`),
  decryptField: (v) => (typeof v === "string" && v.startsWith("enc:") ? v.slice(4) : v),
  decryptFieldLength: (v) => (v == null ? 0 : String(v).length),
}));

import User from "../models/user.model.js";
import Pet from "../models/pet.model.js";
import { Habit, HabitLog } from "../models/habit.model.js";
import {
  createHabit,
  toggleHabitCheckIn,
  computeCurrentStreak,
  computeLongestStreak,
} from "../controllers/habit.controller.js";

function keyNDaysAgo(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fakeUser(overrides = {}) {
  return {
    exerciseScore: 0,
    talkingPointsToday: 0,
    talkingPointsDate: null,
    async save() {
      return this;
    },
    ...overrides,
  };
}

function resStub() {
  return {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe("Habit streak math", () => {
  it("counts consecutive scheduled days including today when done", () => {
    const dates = new Set([keyNDaysAgo(0), keyNDaysAgo(1), keyNDaysAgo(2)]);
    expect(computeCurrentStreak(dates, [0, 1, 2, 3, 4, 5, 6], keyNDaysAgo(0))).toBe(3);
  });

  it("does not break on an incomplete today", () => {
    const dates = new Set([keyNDaysAgo(1), keyNDaysAgo(2)]);
    expect(computeCurrentStreak(dates, [0, 1, 2, 3, 4, 5, 6], keyNDaysAgo(0))).toBe(2);
  });

  it("skips unscheduled days without breaking the streak", () => {
    // Fridays only: done Aug 14 + Aug 21, referenced from Sunday Aug 23.
    const set = new Set(["2026-08-14", "2026-08-21"]);
    expect(computeCurrentStreak(set, [5], "2026-08-23")).toBe(2);
  });

  it("returns 0 when nothing is completed", () => {
    expect(computeCurrentStreak(new Set(), [0, 1, 2, 3, 4, 5, 6], keyNDaysAgo(0))).toBe(0);
  });

  it("longest streak survives an earlier miss that reset the current run", () => {
    const set = new Set([keyNDaysAgo(4), keyNDaysAgo(3), keyNDaysAgo(1), keyNDaysAgo(0)]);
    const all = [0, 1, 2, 3, 4, 5, 6];
    const ref = keyNDaysAgo(0);
    expect(computeLongestStreak(set, all, ref)).toBe(2);
    expect(computeCurrentStreak(set, all, ref)).toBe(2);
  });
});

describe("Habit controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    habitInstances.length = 0;
    Pet.findOne.mockResolvedValue(null);
    Pet.create.mockResolvedValue({});
    HabitLog.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    HabitLog.aggregate.mockResolvedValue([]);
    Habit.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
  });

  it("creates a habit with an encrypted name and returns plaintext", async () => {
    const req = {
      user: { id: "u1" },
      body: { name: "Drink water", emoji: "💧", color: "sky", daysOfWeek: [1] },
    };
    const res = resStub();

    await createHabit(req, res);

    expect(habitInstances).toHaveLength(1);
    expect(habitInstances[0].name).toBe("enc:Drink water");
    expect(habitInstances[0].user).toBe("u1");
    expect(res.statusCode).toBe(201);
    expect(res.payload.name).toBe("Drink water");
    expect(res.payload.color).toBe("sky");
  });

  it("toggling an unchecked day creates a log and awards points", async () => {
    Habit.findOne.mockResolvedValue({ _id: "h1" });
    HabitLog.findOne.mockResolvedValue(null);
    User.findById.mockResolvedValue(fakeUser());

    const req = {
      user: { id: "u1" },
      params: { id: "h1" },
      body: { date: keyNDaysAgo(0) },
    };
    const res = resStub();

    await toggleHabitCheckIn(req, res);

    expect(HabitLog.create).toHaveBeenCalledTimes(1);
    expect(HabitLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ user: "u1", habit: "h1", date: keyNDaysAgo(0) }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.payload.completed).toBe(true);
    expect(res.payload.pointsEarned).toBe(2);
  });

  it("toggling a checked day removes the log and awards nothing", async () => {
    Habit.findOne.mockResolvedValue({ _id: "h1" });
    const existing = { deleteOne: vi.fn() };
    HabitLog.findOne.mockResolvedValue(existing);

    const req = {
      user: { id: "u1" },
      params: { id: "h1" },
      body: { date: keyNDaysAgo(0) },
    };
    const res = resStub();

    await toggleHabitCheckIn(req, res);

    expect(existing.deleteOne).toHaveBeenCalledTimes(1);
    expect(HabitLog.create).not.toHaveBeenCalled();
    expect(res.payload.completed).toBe(false);
    expect(res.payload.pointsEarned).toBe(0);
  });

  it("rejects check-ins for far-future dates", async () => {
    Habit.findOne.mockResolvedValue({ _id: "h1" });

    const req = {
      user: { id: "u1" },
      params: { id: "h1" },
      body: { date: "2031-01-01" },
    };
    const res = resStub();

    await toggleHabitCheckIn(req, res);

    expect(res.statusCode).toBe(400);
    expect(HabitLog.create).not.toHaveBeenCalled();
  });

  it("returns 404 for another user's habit", async () => {
    Habit.findOne.mockResolvedValue(null);

    const req = {
      user: { id: "u1" },
      params: { id: "someone-else" },
      body: { date: keyNDaysAgo(0) },
    };
    const res = resStub();

    await toggleHabitCheckIn(req, res);

    expect(res.statusCode).toBe(404);
    expect(HabitLog.create).not.toHaveBeenCalled();
  });
});
