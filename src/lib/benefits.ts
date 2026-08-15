/**
 * Turns an achievement's granted Promotion into a plain, readable label —
 * used everywhere a member's earned benefit needs to be shown to someone
 * deciding whether to redeem it (staff Adventurer Profile, Cashier, the
 * member self-service page). An achievement's reward is a real Promotion
 * (Achievement.promotionId — see schema.prisma) rather than a separate
 * config shape, so redeeming it is just applying that promotion at
 * checkout (checkout.ts's listEligiblePromotions/applyPromotion already
 * special-case a member's own earned ones).
 */
export function describeBenefit(
  promotionType: string | null | undefined,
  promotionValue: number | null | undefined,
  rewardMenuItemName?: string | null,
): string {
  const value = promotionValue ?? 0;
  switch (promotionType) {
    case "FREE_ITEM":
      return `Free item — ${rewardMenuItemName || "ask staff which item"}`;
    case "PERCENTAGE":
      return `${value}% off`;
    case "FIXED_AMOUNT":
      return `฿${value} off`;
    default:
      return "Reward — ask staff";
  }
}
