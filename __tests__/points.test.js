import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import User from "../models/user.model.js";
import {
  awardMessagePoints,
  DAILY_POINTS_CAP,
  MESSAGE_POINTS,
} from "../utils/points.js";

function fakeUser(overrides = {}) {
  const user = {
    exerciseScore: 0,
    talkingPointsToday: 0,
    talkingPointsDate: null,
    async save() {
      this._saved = true;
      return this;
    },
    ...overrides,
  };
  return user;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

describe("Talking Points (utils/points.js)", () => {
  let spy;

  beforeEach(() => {
    spy = vi.spyOn(User, "findById").mockResolvedValue(fakeUser());
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("awards points and records the daily counter on a fresh day", async () => {
    const user = fakeUser();
    spy.mockResolvedValue(user);

    const earned = await awardMessagePoints("user1", MESSAGE_POINTS.direct);

    expect(earned).toBe(2);
    expect(user.exerciseScore).toBe(2);
    expect(user.talkingPointsToday).toBe(2);
    expect(user.talkingPointsDate).toBeInstanceOf(Date);
  });

  it("resets the counter when the stored date is not today", async () => {
    const user = fakeUser({ talkingPointsToday: 19, talkingPointsDate: daysAgo(1) });
    spy.mockResolvedValue(user);

    const earned = await awardMessagePoints("user1", MESSAGE_POINTS.therry);

    expect(earned).toBe(5);
    expect(user.talkingPointsToday).toBe(5);
    expect(user.exerciseScore).toBe(5);
  });

  it("awards nothing once the daily cap is reached", async () => {
    const user = fakeUser({ talkingPointsToday: DAILY_POINTS_CAP });
    spy.mockResolvedValue(user);

    const earned = await awardMessagePoints("user1", MESSAGE_POINTS.direct);

    expect(earned).toBe(0);
    expect(user.exerciseScore).toBe(0);
    expect(user.talkingPointsToday).toBe(DAILY_POINTS_CAP);
  });

  it("awards only the remaining points under the cap", async () => {
    const user = fakeUser({ talkingPointsToday: DAILY_POINTS_CAP - 1 });
    spy.mockResolvedValue(user);

    const earned = await awardMessagePoints("user1", MESSAGE_POINTS.therry);

    expect(earned).toBe(1);
    expect(user.talkingPointsToday).toBe(DAILY_POINTS_CAP);
    expect(user.exerciseScore).toBe(1);
  });

  it("stays at the cap across multiple awards in one day", async () => {
    const user = fakeUser();
    spy.mockResolvedValue(user);

    let total = 0;
    for (let i = 0; i < 15; i++) {
      total += await awardMessagePoints("user1", MESSAGE_POINTS.direct);
    }

    expect(total).toBe(DAILY_POINTS_CAP);
    expect(user.talkingPointsToday).toBe(DAILY_POINTS_CAP);
    expect(user.exerciseScore).toBe(DAILY_POINTS_CAP);
  });

  it("returns 0 when the user does not exist", async () => {
    spy.mockResolvedValue(null);

    await expect(awardMessagePoints("missing", 2)).resolves.toBe(0);
  });
});
