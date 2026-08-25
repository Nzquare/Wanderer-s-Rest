/**
 * Discount / promotion engine (§19). Eligibility and amount calculation are
 * pure functions; base prices are never mutated — every discount produces a
 * separate line item that checkout snapshots alongside the original price.
 */

export type DiscountType =
  | "PERCENTAGE"
  | "FIXED_AMOUNT"
  | "MENU_ITEM_DISCOUNT"
  | "TABLE_FEE_DISCOUNT"
  | "PACKAGE_DISCOUNT"
  | "FREE_ITEM"
  | "ACHIEVEMENT_BENEFIT"
  | "SPECIAL_PRICE"
  | "EXP_BONUS";

export interface PromotionConfig {
  id: string;
  name: string;
  type: DiscountType;
  /**
   * For FREE_ITEM this is resolved by the caller from the reward item's
   * live price before eligibility/amount checks run — the stored Promotion
   * row doesn't carry a meaningful `value` for this type (see checkout.ts's
   * toPromotionConfig).
   */
  value: number;
  /** Set only for type FREE_ITEM — which menu item this promotion redeems. */
  rewardMenuItemId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  /** 0 = Sunday … 6 = Saturday, per Date#getDay(). Empty/null = every day. */
  activeDays: number[] | null;
  startTime: string | null;
  endTime: string | null;
  minimumSpend: number | null;
  memberOnly: boolean;
  stackable: boolean;
  active: boolean;
}

export interface PromotionContext {
  now: Date;
  hasMember: boolean;
  currentSpend: number;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function isPromotionEligible(
  promo: PromotionConfig,
  ctx: PromotionContext,
): boolean {
  if (!promo.active) return false;
  if (promo.startDate && ctx.now < promo.startDate) return false;
  if (promo.endDate && ctx.now > promo.endDate) return false;
  if (
    promo.activeDays &&
    promo.activeDays.length > 0 &&
    !promo.activeDays.includes(ctx.now.getDay())
  ) {
    return false;
  }
  if (promo.startTime || promo.endTime) {
    const minutesNow = ctx.now.getHours() * 60 + ctx.now.getMinutes();
    const start = promo.startTime ? toMinutes(promo.startTime) : 0;
    const end = promo.endTime ? toMinutes(promo.endTime) : 24 * 60;
    if (minutesNow < start || minutesNow > end) return false;
  }
  if (promo.memberOnly && !ctx.hasMember) return false;
  if (promo.minimumSpend != null && ctx.currentSpend < promo.minimumSpend) {
    return false;
  }
  // FREE_ITEM just needs a reward item configured (§Free item redemptions)
  // — redeeming it hands the guest a separate free item, unlinked from
  // whatever they did or didn't separately order, so there's no "was it
  // actually ordered" check here.
  if (promo.type === "FREE_ITEM" && !promo.rewardMenuItemId) return false;
  // EXP_BONUS (§Award EXP as promotion) is meaningless with no member to
  // credit — hard requirement regardless of whether Members only happens
  // to be checked, same reasoning as FREE_ITEM's reward-item check above.
  if (promo.type === "EXP_BONUS" && !ctx.hasMember) return false;
  return true;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Resolves a promotion's discount amount against the base it applies to. */
export function computeDiscountAmount(
  promo: Pick<PromotionConfig, "type" | "value">,
  baseAmount: number,
): number {
  // EXP_BONUS (§Award EXP as promotion) never discounts the bill — it's
  // handled entirely outside this function, the same way the caller
  // (checkout.ts) treats FREE_ITEM as "a separate gift, not a bill
  // deduction": `promo.value` there is an EXP amount, not money, so it
  // must never reach the money-shaped math below. Checked before the
  // baseAmount<=0 short-circuit too, since an EXP bonus is still real
  // even against a ฿0 bill (a walk-in that only redeemed a free item, say).
  if (promo.type === "EXP_BONUS") return 0;
  if (baseAmount <= 0) return 0;
  switch (promo.type) {
    case "PERCENTAGE":
      return round2(Math.min(baseAmount, baseAmount * (promo.value / 100)));
    case "FIXED_AMOUNT":
    case "MENU_ITEM_DISCOUNT":
    case "TABLE_FEE_DISCOUNT":
    case "PACKAGE_DISCOUNT":
    case "ACHIEVEMENT_BENEFIT":
    case "FREE_ITEM":
    case "SPECIAL_PRICE":
      // For FREE_ITEM/SPECIAL_PRICE the caller passes the resolved item
      // price as `promo.value` (or as baseAmount) — same clamp applies.
      return round2(Math.min(baseAmount, promo.value));
    default:
      return 0;
  }
}

export interface ResolvedDiscount {
  promotionId: string;
  label: string;
  amount: number;
}

/**
 * Picks which eligible promotions actually apply, honoring the stackable
 * flag: at most one non-stackable promotion applies (the largest), plus
 * every eligible stackable one. `baseAmount` is whatever the promotion
 * applies against (table fee subtotal, food/drink subtotal, etc. — caller
 * decides per promotion type).
 */
export function selectApplicableDiscounts(
  promotions: PromotionConfig[],
  ctx: PromotionContext,
  baseAmountFor: (promo: PromotionConfig) => number,
): ResolvedDiscount[] {
  const eligible = promotions.filter((p) => isPromotionEligible(p, ctx));
  const stackable = eligible.filter((p) => p.stackable);
  const exclusive = eligible.filter((p) => !p.stackable);

  const resolved: ResolvedDiscount[] = stackable.map((p) => ({
    promotionId: p.id,
    label: p.name,
    amount: computeDiscountAmount(p, baseAmountFor(p)),
  }));

  if (exclusive.length > 0) {
    const best = exclusive
      .map((p) => ({
        promotionId: p.id,
        label: p.name,
        amount: computeDiscountAmount(p, baseAmountFor(p)),
      }))
      .sort((a, b) => b.amount - a.amount)[0];
    resolved.push(best);
  }

  return resolved;
}
