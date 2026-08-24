-- Quick Sale tables (walk-in/delivery) are retired (active = false)
-- rather than deleted once closed, but their code kept counting up
-- all-time and never reset — staff saw "Walk-in 47" long after only a
-- couple were ever open at once (§walk-in number not resetting).
--
-- Scope uniqueness to only active rows so a retired table's code can be
-- reused by the next one. Prisma's schema DSL can't express a partial
-- index, so this is hand-written and intentionally not mirrored by an
-- `@unique` in schema.prisma (see RestaurantTable.code's comment there).
DROP INDEX "RestaurantTable_code_key";
CREATE INDEX "RestaurantTable_code_idx" ON "RestaurantTable"("code");
CREATE UNIQUE INDEX "RestaurantTable_code_active_key" ON "RestaurantTable"("code") WHERE "active" = true;
