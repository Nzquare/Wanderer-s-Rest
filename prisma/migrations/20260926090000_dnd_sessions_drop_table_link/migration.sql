-- DropForeignKey
ALTER TABLE "DndSession" DROP CONSTRAINT "DndSession_tableSessionId_fkey";

-- DropIndex
DROP INDEX "DndSession_tableSessionId_idx";

-- AlterTable
ALTER TABLE "DndSession" DROP COLUMN "tableSessionId";
