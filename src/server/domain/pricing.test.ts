import { describe, expect, it } from "vitest";
import {
  computePlayerBillableMs,
  computeTableFee,
  minutesToChargedHours,
} from "./pricing";

describe("minutesToChargedHours (§7 grace period examples)", () => {
  const grace = 15;

  it("charges 0 hours for no elapsed time", () => {
    expect(minutesToChargedHours(0, grace)).toBe(0);
  });

  it("charges 1 hour for 0h01m-1h15m", () => {
    expect(minutesToChargedHours(1, grace)).toBe(1);
    expect(minutesToChargedHours(60, grace)).toBe(1);
    expect(minutesToChargedHours(75, grace)).toBe(1);
  });

  it("charges 2 hours for 1h16m-2h15m", () => {
    expect(minutesToChargedHours(76, grace)).toBe(2);
    expect(minutesToChargedHours(90, grace)).toBe(2);
    expect(minutesToChargedHours(135, grace)).toBe(2);
  });

  it("charges 3 hours for 2h16m-3h15m", () => {
    expect(minutesToChargedHours(136, grace)).toBe(3);
    expect(minutesToChargedHours(195, grace)).toBe(3);
  });

  it("respects a configurable grace period", () => {
    // 0 minute grace: any time into the next hour charges it immediately.
    expect(minutesToChargedHours(61, 0)).toBe(2);
    expect(minutesToChargedHours(60, 0)).toBe(1);
  });
});

describe("computePlayerBillableMs", () => {
  const start = new Date("2026-01-01T10:00:00Z");

  it("excludes accumulated paused time", () => {
    const now = new Date("2026-01-01T11:00:00Z"); // 60 min elapsed
    const ms = computePlayerBillableMs(
      {
        id: "p1",
        startTime: start,
        pausedAt: null,
        accumulatedPausedMs: 10 * 60_000, // 10 min already paused
        endTime: null,
        status: "ACTIVE",
      },
      now,
    );
    expect(ms).toBe(50 * 60_000);
  });

  it("excludes an in-progress pause not yet accumulated", () => {
    const pausedAt = new Date("2026-01-01T10:40:00Z");
    const now = new Date("2026-01-01T11:00:00Z");
    const ms = computePlayerBillableMs(
      {
        id: "p1",
        startTime: start,
        pausedAt,
        accumulatedPausedMs: 0,
        endTime: null,
        status: "PAUSED",
      },
      now,
    );
    // 60 min elapsed, but last 20 min (since pausedAt) don't count.
    expect(ms).toBe(40 * 60_000);
  });

  it("never goes negative", () => {
    const ms = computePlayerBillableMs(
      {
        id: "p1",
        startTime: start,
        pausedAt: null,
        accumulatedPausedMs: 999_999_999,
        endTime: null,
        status: "ACTIVE",
      },
      new Date("2026-01-01T11:00:00Z"),
    );
    expect(ms).toBe(0);
  });
});

describe("computeTableFee", () => {
  const regular = {
    model: "HOURLY" as const,
    hourlyRate: 60,
    fixedPrice: null,
    perPerson: true,
    dailyCap: 199,
    gracePeriodMinutes: 15,
  };

  it("charges each player individually — one who left early pays less", () => {
    const now = new Date("2026-01-01T13:00:00Z"); // 3h after start
    const start = new Date("2026-01-01T10:00:00Z");
    const result = computeTableFee({
      pricingType: regular,
      now,
      players: [
        {
          id: "p1",
          startTime: start,
          pausedAt: null,
          accumulatedPausedMs: 0,
          endTime: null,
          status: "ACTIVE",
        }, // full 3h -> 180 baht, still under the 199 cap
        {
          id: "p2",
          startTime: start,
          pausedAt: null,
          accumulatedPausedMs: 0,
          endTime: new Date("2026-01-01T11:00:00Z"), // stopped after 1h
          status: "STOPPED",
        },
      ],
    });
    const p1 = result.lines.find((l) => l.playerId === "p1")!;
    const p2 = result.lines.find((l) => l.playerId === "p2")!;

    expect(p1.chargedHours).toBe(3);
    expect(p1.fee).toBe(180); // 3 * 60 = 180 < 199, so NOT capped here
    expect(p2.chargedHours).toBe(1);
    expect(p2.fee).toBe(60);
    expect(result.total).toBe(240);
  });

  it("applies the daily cap once hourly fee reaches/exceeds it", () => {
    const start = new Date("2026-01-01T08:00:00Z");
    const now = new Date("2026-01-01T12:30:00Z"); // 4.5h -> 5 charged hours -> 300 baht, capped to 199
    const result = computeTableFee({
      pricingType: regular,
      now,
      players: [
        {
          id: "p1",
          startTime: start,
          pausedAt: null,
          accumulatedPausedMs: 0,
          endTime: null,
          status: "ACTIVE",
        },
      ],
    });
    expect(result.lines[0].chargedHours).toBe(5);
    expect(result.lines[0].fee).toBe(199);
    expect(result.lines[0].cappedAtDailyCap).toBe(true);
  });

  it("uses the student rate when pricing type says so", () => {
    const student = { ...regular, hourlyRate: 50 };
    const now = new Date("2026-01-01T11:00:00Z");
    const result = computeTableFee({
      pricingType: student,
      now,
      players: [
        {
          id: "p1",
          startTime: new Date("2026-01-01T10:00:00Z"),
          pausedAt: null,
          accumulatedPausedMs: 0,
          endTime: null,
          status: "ACTIVE",
        },
      ],
    });
    expect(result.total).toBe(50);
  });

  it("charges a flat package price per person when configured", () => {
    const result = computeTableFee({
      pricingType: {
        model: "PACKAGE",
        hourlyRate: null,
        fixedPrice: null,
        perPerson: true,
        dailyCap: null,
        gracePeriodMinutes: 15,
      },
      packagePrice: 500,
      players: [
        {
          id: "p1",
          startTime: new Date(),
          pausedAt: null,
          accumulatedPausedMs: 0,
          endTime: null,
          status: "ACTIVE",
        },
        {
          id: "p2",
          startTime: new Date(),
          pausedAt: null,
          accumulatedPausedMs: 0,
          endTime: null,
          status: "ACTIVE",
        },
      ],
    });
    expect(result.total).toBe(1000);
  });
});
