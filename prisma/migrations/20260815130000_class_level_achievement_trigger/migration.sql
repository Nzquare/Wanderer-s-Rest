-- AlterEnum
-- Achievements can now trigger on "reached level N while in class X"
-- (§Class-tied achievements — e.g. "Level 21 Fighter" unlocks "Amateur
-- Fighter"). triggerValue for this type is { classId, level }.
ALTER TYPE "AchievementTriggerType" ADD VALUE 'CLASS_LEVEL_REACHED';
