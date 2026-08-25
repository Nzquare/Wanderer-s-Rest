-- Adds EXP_BONUS to DiscountType (§Award EXP as promotion) — a promotion
-- type that grants the member flat bonus EXP at checkout instead of
-- discounting the bill. ADD VALUE can't run inside the same transaction as
-- a statement that uses the new value, but nothing here does.
ALTER TYPE "DiscountType" ADD VALUE 'EXP_BONUS';
