-- Allow a menu item to be hard-deleted even after it's been ordered
-- (§Delete anyway). OrderItem already carries a full snapshot
-- (nameSnapshotTh/En, unitPriceSnapshot) independent of the live
-- MenuItem row, so losing the live link on delete doesn't lose any
-- receipt/report data — it only means UI that groups by the item's
-- *live* category (checkout's bill grouping, Sales by Category/Product
-- reports) falls back to an "Other" bucket for that line.
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_menuItemId_fkey";
ALTER TABLE "OrderItem" ALTER COLUMN "menuItemId" DROP NOT NULL;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
