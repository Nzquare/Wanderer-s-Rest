-- DropIndex
-- Rank.order was uniquely constrained, which makes a drag-to-reorder
-- (renumber every row's order in one batch) impossible without a
-- transient duplicate tripping the constraint mid-update. Every other
-- reorderable list in this schema (PricingType.sortOrder,
-- MenuCategory.sortOrder, GameCategory.sortOrder, ...) already uses a
-- plain non-unique Int for exactly this reason — bringing Rank in line.
DROP INDEX "Rank_order_key";

-- AlterTable
ALTER TABLE "Rank" ALTER COLUMN "order" SET DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
