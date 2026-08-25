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

    // A redeemed free item is a separate gift, unlinked from whatever the
    // guest did or didn't separately order (§Free item redemptions) — so
    // as long as a reward item is configured, it's eligible regardless of
    // what's actually in this bill's order.
    it("is eligible with a reward item configured, regardless of the order", () => {
      const p = promo({ type: "FREE_ITEM", rewardMenuItemId: "fried-chicken" });
      expect(isPromotionEligible(p, baseCtx)).toBe(true);
    });
  });

  describe("EXP_BONUS", () => {
    // §Award EXP as promotion — meaningless with no member to credit, so
    // this is a hard requirement regardless of the memberOnly flag, same
    // as FREE_ITEM's reward-item requirement above.
    it("is ineligible with no member linked, even if memberOnly is off", () => {
      const p = promo({ type: "EXP_BONUS", value: 50, memberOnly: false });
      expect(isPromotionEligible(p, baseCtx)).toBe(false);
      expect(isPromotionEligible(p, { ...baseCtx, hasMember: true })).toBe(true);
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

  it("EXP_BONUS never discounts the bill — checkout.ts awards it separately", () => {
    expect(computeDiscountAmount({ type: "EXP_BONUS", value: 50 }, 500)).toBe(0);
    // Still 0 even against a ฿0 bill (§Award EXP as promotion) — the
    // baseAmount<=0 short-circuit above this switch doesn't apply to it.
    expect(computeDiscountAmount({ type: "EXP_BONUS", value: 50 }, 0)).toBe(0);
  });
});
