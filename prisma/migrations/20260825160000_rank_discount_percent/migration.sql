-- Automatic %-off for members currently holding a given rank (§Rank
-- discount). Defaults to 0 so no existing rank's checkout behavior
-- changes just from this column existing.
ALTER TABLE "Rank" ADD COLUMN "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
