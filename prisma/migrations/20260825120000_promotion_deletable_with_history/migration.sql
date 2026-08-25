-- Snapshot the promotion a BenefitRedemption grants, independent of the
-- live Promotion row, then loosen promotionId to nullable + ON DELETE SET
-- NULL so a Promotion can be force-deleted even after a member has earned
-- or redeemed it — same reasoning as AppliedDiscount.label (see
-- 20260807174005_init), just applied to this table too.

-- 1. Add the snapshot columns nullable first so existing rows can be
--    backfilled before NOT NULL is enforced.
ALTER TABLE "BenefitRedemption" ADD COLUMN "promotionNameSnapshot" TEXT;
ALTER TABLE "BenefitRedemption" ADD COLUMN "promotionTypeSnapshot" "DiscountType";
ALTER TABLE "BenefitRedemption" ADD COLUMN "promotionValueSnapshot" DECIMAL(12,2);
ALTER TABLE "BenefitRedemption" ADD COLUMN "rewardMenuItemNameSnapshot" TEXT;

-- 2. Backfill every existing row from its still-live Promotion (every row
--    at this point has a non-null promotionId — the column hasn't been
--    loosened yet).
UPDATE "BenefitRedemption" br
SET
  "promotionNameSnapshot" = p."name",
  "promotionTypeSnapshot" = p."type",
  "promotionValueSnapshot" = p."value",
  "rewardMenuItemNameSnapshot" = mi."nameEn"
FROM "Promotion" p
LEFT JOIN "MenuItem" mi ON mi."id" = p."rewardMenuItemId"
WHERE br."promotionId" = p."id";

-- 3. Now that every row is backfilled, enforce NOT NULL on the three
--    fields every redemption must have (rewardMenuItemNameSnapshot stays
--    nullable — only a FREE_ITEM promotion ever had one).
ALTER TABLE "BenefitRedemption" ALTER COLUMN "promotionNameSnapshot" SET NOT NULL;
ALTER TABLE "BenefitRedemption" ALTER COLUMN "promotionTypeSnapshot" SET NOT NULL;
ALTER TABLE "BenefitRedemption" ALTER COLUMN "promotionValueSnapshot" SET NOT NULL;

-- 4. Loosen promotionId itself: drop the RESTRICT fkey, make the column
--    nullable, re-add the fkey as SET NULL.
ALTER TABLE "BenefitRedemption" DROP CONSTRAINT "BenefitRedemption_promotionId_fkey";
ALTER TABLE "BenefitRedemption" ALTER COLUMN "promotionId" DROP NOT NULL;
ALTER TABLE "BenefitRedemption" ADD CONSTRAINT "BenefitRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
