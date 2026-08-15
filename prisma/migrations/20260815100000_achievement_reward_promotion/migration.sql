-- AlterTable
-- Achievement.benefitType/benefitConfig (inline reward config) is replaced
-- by a link to an actual Promotion — redeeming a reward is then just
-- applying a promotion at checkout instead of a separate mechanism. No
-- data-preserving backfill here: this app has no live members/receipts
-- yet, and there's no lossless mapping from the old inline benefitConfig
-- shape to a real Promotion row anyway (a Promotion needs a rewardMenuItem
-- FK, not a name snapshot).
ALTER TABLE "Achievement" DROP COLUMN "benefitType",
DROP COLUMN "benefitConfig",
ADD COLUMN     "promotionId" TEXT;

-- DropEnum
DROP TYPE "BenefitType";

-- CreateIndex
CREATE INDEX "Achievement_promotionId_idx" ON "Achievement"("promotionId");

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
