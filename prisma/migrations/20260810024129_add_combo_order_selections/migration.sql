-- AlterTable
ALTER TABLE "ComboSlot" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OrderItemComboSelection" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "comboSlotId" TEXT,
    "slotNameSnapshotTh" TEXT NOT NULL,
    "slotNameSnapshotEn" TEXT NOT NULL,
    "selectedMenuItemId" TEXT,
    "nameSnapshotTh" TEXT NOT NULL,
    "nameSnapshotEn" TEXT NOT NULL,
    "extraChargeSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItemComboSelection_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OrderItemComboSelection" ADD CONSTRAINT "OrderItemComboSelection_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemComboSelection" ADD CONSTRAINT "OrderItemComboSelection_comboSlotId_fkey" FOREIGN KEY ("comboSlotId") REFERENCES "ComboSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemComboSelection" ADD CONSTRAINT "OrderItemComboSelection_selectedMenuItemId_fkey" FOREIGN KEY ("selectedMenuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
