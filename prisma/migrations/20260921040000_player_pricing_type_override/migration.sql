-- Per-player pricing-type override (§Mixed pricing per table) — a table
-- can now mix e.g. Student and Regular players instead of billing
-- everyone at the table's single rate. Nullable, no backfill needed:
-- null means "use the table's own pricingType", exactly the behavior
-- every existing SessionPlayer row already has.
ALTER TABLE "SessionPlayer" ADD COLUMN "pricingTypeId" TEXT;

CREATE INDEX "SessionPlayer_pricingTypeId_idx" ON "SessionPlayer"("pricingTypeId");

ALTER TABLE "SessionPlayer" ADD CONSTRAINT "SessionPlayer_pricingTypeId_fkey" FOREIGN KEY ("pricingTypeId") REFERENCES "PricingType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
