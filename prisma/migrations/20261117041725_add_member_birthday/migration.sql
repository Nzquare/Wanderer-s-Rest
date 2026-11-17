-- DropForeignKey
ALTER TABLE "BenefitRedemption" DROP CONSTRAINT "BenefitRedemption_memberAchievementId_fkey";

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "birthday" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Rank" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "BenefitRedemption" ADD CONSTRAINT "BenefitRedemption_memberAchievementId_fkey" FOREIGN KEY ("memberAchievementId") REFERENCES "MemberAchievement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
