-- AlterTable
-- BenefitRedemption gains direct member/promotion links and optional grant
-- metadata, and memberAchievementId becomes optional — a benefit can now be
-- granted straight to a member with no achievement involved at all
-- (§Direct benefit grants, e.g. a birthday reward).
ALTER TABLE "BenefitRedemption" ALTER COLUMN "memberAchievementId" DROP NOT NULL;
ALTER TABLE "BenefitRedemption" ADD COLUMN     "memberId" TEXT;
ALTER TABLE "BenefitRedemption" ADD COLUMN     "promotionId" TEXT;
ALTER TABLE "BenefitRedemption" ADD COLUMN     "label" TEXT;
ALTER TABLE "BenefitRedemption" ADD COLUMN     "grantedById" TEXT;

-- Backfill every existing (achievement-earned) row from its
-- MemberAchievement -> Achievement chain before memberId/promotionId
-- become required below.
UPDATE "BenefitRedemption" br
SET "memberId" = ma."memberId",
    "promotionId" = a."promotionId"
FROM "MemberAchievement" ma
JOIN "Achievement" a ON a.id = ma."achievementId"
WHERE br."memberAchievementId" = ma.id;

-- A pre-existing edge case let an achievement be saved with hasReward=true
-- but no promotion actually picked, which produced a redemption nothing in
-- the app could ever describe (no promotion to point at). Those rows were
-- already dead weight — drop them rather than leave promotionId nullable
-- just to accommodate them.
DELETE FROM "BenefitRedemption" WHERE "promotionId" IS NULL;

ALTER TABLE "BenefitRedemption" ALTER COLUMN "memberId" SET NOT NULL;
ALTER TABLE "BenefitRedemption" ALTER COLUMN "promotionId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "BenefitRedemption_memberId_idx" ON "BenefitRedemption"("memberId");
CREATE INDEX "BenefitRedemption_promotionId_idx" ON "BenefitRedemption"("promotionId");

-- AddForeignKey
ALTER TABLE "BenefitRedemption" ADD CONSTRAINT "BenefitRedemption_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenefitRedemption" ADD CONSTRAINT "BenefitRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenefitRedemption" ADD CONSTRAINT "BenefitRedemption_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
