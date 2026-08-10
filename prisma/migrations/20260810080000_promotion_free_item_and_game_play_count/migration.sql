-- AlterEnum
ALTER TYPE "AchievementTriggerType" ADD VALUE 'SPECIFIC_GAME_PLAY_COUNT';

-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "rewardMenuItemId" TEXT;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_rewardMenuItemId_fkey" FOREIGN KEY ("rewardMenuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

