import { describe, expect, it } from "vitest";
import { evaluateNewlyUnlocked, isAchievementSatisfied } from "./achievements";

describe("isAchievementSatisfied", () => {
  const stats = {
    visits: 10,
    totalLevel: 8,
    rankOrder: 2,
    lifetimeSpending: 5200,
  };

  it("VISIT_COUNT", () => {
    expect(
      isAchievementSatisfied({ triggerType: "VISIT_COUNT", triggerValue: { count: 10 } }, stats),
    ).toBe(true);
    expect(
      isAchievementSatisfied({ triggerType: "VISIT_COUNT", triggerValue: { count: 11 } }, stats),
    ).toBe(false);
  });

  it("LEVEL_REACHED", () => {
    expect(
      isAchievementSatisfied({ triggerType: "LEVEL_REACHED", triggerValue: { level: 8 } }, stats),
    ).toBe(true);
  });

  it("RANK_REACHED", () => {
    expect(
      isAchievementSatisfied(
        { triggerType: "RANK_REACHED", triggerValue: { rankOrder: 3 } },
        stats,
      ),
    ).toBe(false);
  });

  it("LIFETIME_SPEND", () => {
    expect(
      isAchievementSatisfied(
        { triggerType: "LIFETIME_SPEND", triggerValue: { amount: 5000 } },
        stats,
      ),
    ).toBe(true);
  });

  it("returns false for game-based triggers with no game data yet", () => {
    expect(
      isAchievementSatisfied(
        { triggerType: "UNIQUE_GAMES_COUNT", triggerValue: { count: 1 } },
        stats,
      ),
    ).toBe(false);
  });

  it("returns false with no trigger configured", () => {
    expect(isAchievementSatisfied({ triggerType: null, triggerValue: null }, stats)).toBe(false);
  });
});

describe("evaluateNewlyUnlocked", () => {
  const stats = { visits: 10, totalLevel: 8, rankOrder: 2, lifetimeSpending: 5200 };
  const defs = [
    { id: "a1", triggerType: "VISIT_COUNT" as const, triggerValue: { count: 10 }, repeatable: false },
    { id: "a2", triggerType: "VISIT_COUNT" as const, triggerValue: { count: 20 }, repeatable: false },
    { id: "a3", triggerType: "LEVEL_REACHED" as const, triggerValue: { level: 5 }, repeatable: true },
  ];

  it("only returns newly-satisfied, not-yet-unlocked achievements", () => {
    const result = evaluateNewlyUnlocked(defs, new Set(), stats);
    expect(result.map((d) => d.id)).toEqual(["a1", "a3"]);
  });

  it("skips already-unlocked non-repeatable achievements", () => {
    const result = evaluateNewlyUnlocked(defs, new Set(["a1"]), stats);
    expect(result.map((d) => d.id)).toEqual(["a3"]);
  });

  it("re-offers a repeatable achievement even if already unlocked once", () => {
    const result = evaluateNewlyUnlocked(defs, new Set(["a3"]), stats);
    expect(result.map((d) => d.id)).toEqual(["a1", "a3"]);
  });
});
