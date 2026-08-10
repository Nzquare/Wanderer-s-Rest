-- AlterEnum
BEGIN;
CREATE TYPE "AchievementTriggerType_new" AS ENUM ('VISIT_COUNT', 'RANK_REACHED', 'LEVEL_REACHED', 'UNIQUE_GAMES_COUNT', 'CATEGORY_GAMES_COUNT', 'CATEGORIES_PLAYED_COUNT', 'SPECIFIC_GAME_PLAYED', 'TOTAL_GAMES_COUNT', 'LIFETIME_SPEND', 'CUSTOM');
ALTER TABLE "Achievement" ALTER COLUMN "triggerType" TYPE "AchievementTriggerType_new" USING ("triggerType"::text::"AchievementTriggerType_new");
ALTER TYPE "AchievementTriggerType" RENAME TO "AchievementTriggerType_old";
ALTER TYPE "AchievementTriggerType_new" RENAME TO "AchievementTriggerType";
DROP TYPE "public"."AchievementTriggerType_old";
COMMIT;

-- AlterTable
ALTER TABLE "GameCategory" DROP COLUMN "isCoop";

