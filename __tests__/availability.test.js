import { describe, it, expect } from "vitest";
import {
  computeFreeSlots,
  slotsToDate,
  dateToStr,
  addDays,
  startOfDay,
} from "../utils/availability.js";
import { reviewSchema, createAppointmentSchema } from "../utils/validation.js";

const thursday = new Date(2026, 7, 27);
const dow = thursday.getDay();
const from = startOfDay(thursday);
const to = addDays(from, 7);

describe("computeFreeSlots", () => {
  it("returns [] when the therapist has no availability", () => {
    expect(
      computeFreeSlots({ weeklyAvailability: [], from, to, duration: 50 })
    ).toEqual([]);
  });

  it("generates 50-min slots inside a daily window", () => {
    const slots = computeFreeSlots({
      weeklyAvailability: [{ dayOfWeek: dow, startTime: "09:00", endTime: "11:30" }],
      from,
      to,
      duration: 50,
    });
    expect(slots.length).toBe(3);
    expect(slots[0].getHours()).toBe(9);
    expect(slots[0].getMinutes()).toBe(0);
    expect(slots[1].getMinutes()).toBe(50);
    expect(slots[2].getHours()).toBe(10);
    expect(slots[2].getMinutes()).toBe(40);
  });

  it("repeats the window for every matching day in range", () => {
    const secondDow = (dow + 1) % 7;
    const slots = computeFreeSlots({
      weeklyAvailability: [
        { dayOfWeek: dow, startTime: "09:00", endTime: "10:00" },
        { dayOfWeek: secondDow, startTime: "09:00", endTime: "10:00" },
      ],
      from,
      to,
      duration: 50,
    });
    const uniqueDays = new Set(slots.map((s) => dateToStr(s)));
    expect(uniqueDays.size).toBe(2);
  });

  it("skips slots earlier than `from` on the first day", () => {
    const lateMorning = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate(),
      9,
      30,
      0,
      0
    );
    const slots = computeFreeSlots({
      weeklyAvailability: [{ dayOfWeek: dow, startTime: "09:00", endTime: "12:00" }],
      from: lateMorning,
      to,
      duration: 50,
    });
    expect(slots[0].getMinutes()).toBe(50);
  });

  it("excludes slots that overlap existing appointments", () => {
    const apptStart = slotsToDate(dateToStr(from), "09:50");
    const slots = computeFreeSlots({
      weeklyAvailability: [{ dayOfWeek: dow, startTime: "09:00", endTime: "12:00" }],
      appointments: [{ start: apptStart, duration: 50 }],
      from,
      to,
      duration: 50,
    });
    const times = slots.map(
      (s) => `${s.getHours()}:${String(s.getMinutes()).padStart(2, "0")}`
    );
    expect(times).toEqual(["9:00", "10:40"]);
  });
});

describe("date helpers", () => {
  it("round-trips date strings through slotsToDate/dateToStr", () => {
    const d = slotsToDate("2026-08-27", "14:30");
    expect(dateToStr(d)).toBe("2026-08-27");
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });
});

describe("reviewSchema", () => {
  it("accepts a valid review", () => {
    const ok = reviewSchema.safeParse({ rating: 5, title: "Great", content: "Really helpful session." });
    expect(ok.success).toBe(true);
  });
  it("rejects ratings outside 1-5", () => {
    expect(reviewSchema.safeParse({ rating: 6, content: "x" }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 0, content: "x" }).success).toBe(false);
  });
  it("rejects empty content", () => {
    expect(reviewSchema.safeParse({ rating: 4, content: "" }).success).toBe(false);
  });
});

describe("createAppointmentSchema", () => {
  it("accepts a valid booking", () => {
    const ok = createAppointmentSchema.safeParse({
      therapistId: "507f1f77bcf86cd799439011",
      date: "2026-09-01",
      time: "10:00",
      duration: 50,
    });
    expect(ok.success).toBe(true);
  });
  it("rejects a bad time format", () => {
    expect(
      createAppointmentSchema.safeParse({ therapistId: "x", date: "2026-09-01", time: "25:99" }).success
    ).toBe(false);
  });
});