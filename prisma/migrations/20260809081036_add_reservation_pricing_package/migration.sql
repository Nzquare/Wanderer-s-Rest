-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "packageId" TEXT,
ADD COLUMN     "pricingTypeId" TEXT;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_pricingTypeId_fkey" FOREIGN KEY ("pricingTypeId") REFERENCES "PricingType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;
