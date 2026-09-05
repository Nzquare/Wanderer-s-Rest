import { describe, expect, it } from "vitest";
import { isShiftStale, SHIFT_STALE_HOURS } from "./shift";

describe("isShiftStale", () => {
  const now = new Date("2026-08-26T12:00:00Z");

  it("is not stale just under the threshold", () => {
    const openedAt = new Date(now.getTime() - (SHIFT_STALE_HOURS * 60 * 60 * 1000 - 1000));
    expect(isShiftStale(openedAt, now)).toBe(false);
  });

  it("is stale just over the threshold", () => {
    const openedAt = new Date(now.getTime() - (SHIFT_STALE_HOURS * 60 * 60 * 1000 + 1000));
    expect(isShiftStale(openedAt, now)).toBe(true);
  });

  it("accepts an ISO string the same as a Date", () => {
    const openedAt = new Date(now.getTime() - (SHIFT_STALE_HOURS + 1) * 60 * 60 * 1000).toISOString();
    expect(isShiftStale(openedAt, now)).toBe(true);
  });
});
