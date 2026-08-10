import { describe, expect, it } from "vitest";
import { computeDiscountAmount, isPromotionEligible, type PromotionConfig } from "./discounts";

function promo(overrides: Partial<PromotionConfig> = {}): PromotionConfig {
  return {
    id: "p1",
    name: "Test promo",
    type: "PERCENTAGE",
    value: 10,
    rewardMenuItemId: null,
    startDate: null,
    endDate: null,
    activeDays: null,
    startTime: null,
    endTime: null,
    minimumSpend: null,
    memberOnly: false,
    stackable: false,
    active: true,
    ...overrides,
  };
}

const baseCtx = {
  now: new Date("2026-08-10T12:00:00"),
  hasMember: false,
  currentSpend: 500,
  orderedMenuItemIds: new Set<string>(),
};

describe("isPromotionEligible", () => {
  it("rejects an inactive promotion", () => {
    expect(isPromotionEligible(promo({ active: false }), baseCtx)).toBe(false);
  });

  it("rejects a member-only promotion for a walk-in", () => {
    expect(isPromotionEligible(promo({ memberOnly: true }), baseCtx)).toBe(false);
    expect(
      isPromotionEligible(promo({ memberOnly: true }), { ...baseCtx, hasMember: true }),
    ).toBe(true);
  });

  it("rejects when below minimum spend", () => {
    expect(isPromotionEligible(promo({ minimumSpend: 1000 }), baseCtx)).toBe(false);
  });

  describe("FREE_ITEM", () => {
    it("is ineligible with no reward item configured", () => {
      expect(isPromotionEligible(promo({ type: "FREE_ITEM", rewardMenuItemId: null }), baseCtx)).toBe(
        false,
      );
    });

    it("is ineligible when the reward item isn't in the order", () => {
      const p = promo({ type: "FREE_ITEM", rewardMenuItemId: "fried-chicken" });
      expect(isPromotionEligible(p, baseCtx)).toBe(false);
    });

    it("is eligible once the reward item is actually ordered", () => {
      const p = promo({ type: "FREE_ITEM", rewardMenuItemId: "fried-chicken" });
      const ctx = { ...baseCtx, orderedMenuItemIds: new Set(["fried-chicken"]) };
      expect(isPromotionEligible(p, ctx)).toBe(true);
    });
  });
});

describe("computeDiscountAmount", () => {
  it("computes a percentage off, clamped to the base amount", () => {
    expect(computeDiscountAmount({ type: "PERCENTAGE", value: 20 }, 500)).toBe(100);
    expect(computeDiscountAmount({ type: "PERCENTAGE", value: 200 }, 500)).toBe(500);
  });

  it("computes a fixed amount off, clamped to the base amount", () => {
    expect(computeDiscountAmount({ type: "FIXED_AMOUNT", value: 50 }, 500)).toBe(50);
    expect(computeDiscountAmount({ type: "FIXED_AMOUNT", value: 5000 }, 500)).toBe(500);
  });

  it("FREE_ITEM clamps to the resolved item price (passed as value)", () => {
    // checkout.ts resolves `value` from the reward item's live price before
    // this is called — a ฿150 item never discounts more than ฿150.
    expect(computeDiscountAmount({ type: "FREE_ITEM", value: 150 }, 500)).toBe(150);
    // ...and never more than what's actually left on the bill.
    expect(computeDiscountAmount({ type: "FREE_ITEM", value: 150 }, 80)).toBe(80);
  });
});
