import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../models/mood.model.js", () => ({
  default: { find: vi.fn() },
}))
vi.mock("../models/notification.model.js", () => ({
  default: { findOne: vi.fn() },
}))
vi.mock("../models/therryMessage.model.js", () => ({
  TherryMessage: { create: vi.fn() },
}))
vi.mock("../services/notification.service.js", () => ({
  createNotification: vi.fn(),
}))
vi.mock("../utils/crypto.js", () => ({
  encryptField: (v) => v,
}))

import {
  computeMoodCheckin,
  maybeSendMoodCheckin,
  CHECKIN_TITLE,
  CHECKIN_BODY,
} from "../services/moodCheckin.service.js"
import Mood from "../models/mood.model.js"
import Notification from "../models/notification.model.js"
import { TherryMessage } from "../models/therryMessage.model.js"
import { createNotification } from "../services/notification.service.js"

const daysAgo = (n) => new Date(Date.now() - n * 86400000)

// great=4, good=3, okay=2, bad=1, terrible=0
const DECLINE_ENTRIES = [
  { mood: "great", date: daysAgo(6) },
  { mood: "good", date: daysAgo(5) },
  { mood: "okay", date: daysAgo(4) },
  { mood: "bad", date: daysAgo(3) },
  { mood: "bad", date: daysAgo(2) },
  { mood: "bad", date: daysAgo(1) },
]

function mockMoodFind(entries) {
  Mood.find.mockReturnValue({
    sort: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(
      entries.map((e) => ({ mood: e.mood, date: e.date }))
    ),
  })
}

describe("computeMoodCheckin", () => {
  it("returns null with fewer than 3 entries", () => {
    expect(computeMoodCheckin([{ mood: "good", date: daysAgo(1) }])).toBeNull()
  })

  it("returns null when the recent entries are not all below baseline", () => {
    const entries = [
      { mood: "bad", date: daysAgo(6) },
      { mood: "bad", date: daysAgo(5) },
      { mood: "bad", date: daysAgo(4) },
      { mood: "great", date: daysAgo(3) },
      { mood: "good", date: daysAgo(2) },
      { mood: "good", date: daysAgo(1) },
    ]
    expect(computeMoodCheckin(entries)).toBeNull()
  })

  it("detects a decline when the 3 most recent entries are below the 14-day baseline", () => {
    const decision = computeMoodCheckin(DECLINE_ENTRIES)
    expect(decision).not.toBeNull()
    expect(decision.baseline).toBeCloseTo(2.2, 5)
    expect(decision.recentScores).toEqual([1, 1, 1])
  })

  it("ignores prior entries outside the 14-day baseline window", () => {
    const entries = [
      { mood: "great", date: daysAgo(30) },
      { mood: "great", date: daysAgo(29) },
      { mood: "great", date: daysAgo(28) },
      { mood: "okay", date: daysAgo(3) },
      { mood: "bad", date: daysAgo(2) },
      { mood: "bad", date: daysAgo(1) },
    ]
    // Prior in-window = okay(2) only -> fewer than 3 -> no check-in.
    expect(computeMoodCheckin(entries)).toBeNull()
  })
})

describe("maybeSendMoodCheckin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sends a notification and persists a Therry assistant message on decline", async () => {
    mockMoodFind(DECLINE_ENTRIES)
    Notification.findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
    })

    const result = await maybeSendMoodCheckin("user123")

    expect(result).toEqual({ sent: true })
    expect(createNotification).toHaveBeenCalledWith(
      "user123",
      "mood_checkin",
      CHECKIN_TITLE,
      CHECKIN_BODY,
      { url: "/chat/therry" }
    )
    expect(TherryMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: "user123",
        role: "assistant",
        category: "checkin",
      })
    )
  })

  it("skips when the user was already checked in within 3 days", async () => {
    mockMoodFind(DECLINE_ENTRIES)
    Notification.findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: "existing" }),
    })

    const result = await maybeSendMoodCheckin("user123")

    expect(result).toEqual({ skipped: "rate_limited" })
    expect(createNotification).not.toHaveBeenCalled()
    expect(TherryMessage.create).not.toHaveBeenCalled()
  })

  it("does nothing when there is no decline", async () => {
    mockMoodFind([
      { mood: "bad", date: daysAgo(6) },
      { mood: "bad", date: daysAgo(5) },
      { mood: "bad", date: daysAgo(4) },
      { mood: "great", date: daysAgo(3) },
      { mood: "good", date: daysAgo(2) },
      { mood: "good", date: daysAgo(1) },
    ])

    const result = await maybeSendMoodCheckin("user123")

    expect(result).toBeNull()
    expect(createNotification).not.toHaveBeenCalled()
    expect(TherryMessage.create).not.toHaveBeenCalled()
  })

  it("does nothing with insufficient history", async () => {
    mockMoodFind([])

    const result = await maybeSendMoodCheckin("user123")

    expect(result).toBeNull()
    expect(createNotification).not.toHaveBeenCalled()
  })
})
