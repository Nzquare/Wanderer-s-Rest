-- CreateEnum
CREATE TYPE "TableKind" AS ENUM ('STANDARD', 'WALK_IN', 'DELIVERY', 'SPLIT');

-- AlterTable
ALTER TABLE "RestaurantTable" ADD COLUMN     "kind" "TableKind" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "originTableId" TEXT;

-- CreateIndex
CREATE INDEX "RestaurantTable_kind_idx" ON "RestaurantTable"("kind");

-- AddForeignKey
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_originTableId_fkey" FOREIGN KEY ("originTableId") REFERENCES "RestaurantTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
