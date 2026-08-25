import type { DiscountType } from "@/generated/prisma/enums";
import { toNum } from "@/lib/decimal";

/**
 * BenefitRedemption.promotion* snapshot fields (see schema comment) — a
 * copy of what a promotion was worth, taken the moment a member's benefit
 * is created (achievement unlock or direct grant), independent of the live
 * Promotion row. Every creation site builds its `data` from this so a
 * force-deleted promotion (§Promotion delete) never changes what an
 * already-earned or already-used redemption says it was worth.
 */
export function snapshotPromotion(promotion: {
  name: string;
  type: string;
  value: unknown;
  rewardMenuItem: { nameEn: string } | null;
}) {
  return {
    promotionNameSnapshot: promotion.name,
    promotionTypeSnapshot: promotion.type as DiscountType,
    promotionValueSnapshot: toNum(promotion.value),
    rewardMenuItemNameSnapshot: promotion.rewardMenuItem?.nameEn ?? null,
  };
}

/**
 * The flip side — resolves a BenefitRedemption's effective name/type/value/
 * reward-item down to one flat shape, whether its promotion is still live
 * (preferred, in case the promotion's own name/value changed since — an
 * AVAILABLE one should describe the promotion as it is *now*) or gone
 * (falls back to the snapshot, which is then the only record left of what
 * it was worth). Every reader (member profile, self-service lookup) goes
 * through this instead of reading `.promotion.*` directly, since that can
 * now be null.
 */
export function resolveBenefitPromotion(b: {
  promotion: { name: string; type: string; value: unknown; rewardMenuItem: { nameEn: string } | null } | null;
  promotionNameSnapshot: string;
  promotionTypeSnapshot: string;
  promotionValueSnapshot: unknown;
  rewardMenuItemNameSnapshot: string | null;
}) {
  if (b.promotion) {
    return {
      name: b.promotion.name,
      type: b.promotion.type,
      value: toNum(b.promotion.value),
      rewardMenuItemName: b.promotion.rewardMenuItem?.nameEn ?? null,
    };
  }
  return {
    name: b.promotionNameSnapshot,
    type: b.promotionTypeSnapshot,
    value: toNum(b.promotionValueSnapshot),
    rewardMenuItemName: b.rewardMenuItemNameSnapshot,
  };
}
