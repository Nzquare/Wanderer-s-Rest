-- Payment "methods" used to be a fixed CASH/PROMPTPAY/CARD/OTHER enum —
-- now a Back Office-managed table (§Payment methods — manage your own),
-- so a café can add whatever it actually takes payment through (Grab,
-- Line Man, ...) instead of everything non-standard being forced into
-- "Other". Recipe is the same one 20260825120000_promotion_deletable_
-- with_history already used for a force-deletable historical relation:
-- add the new nullable columns, backfill every existing row, enforce
-- NOT NULL on the snapshot, then wire the FK up as SET NULL.

-- 1. The new table wants the name "PaymentMethod", which the old enum
--    type already holds — move the enum out of the way first (its
--    values are only read by-name during the backfill below, then the
--    whole type is dropped).
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethodOld";

-- 2. Create the managed table.
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "countsAsCash" BOOLEAN NOT NULL DEFAULT false,
    "showQrCode" BOOLEAN NOT NULL DEFAULT false,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentMethod_code_key" ON "PaymentMethod"("code");

-- 3. Seed the four built-ins this app already had, preserving exactly
--    the behavior each one already had (Cash = counts toward the cash
--    drawer, PromptPay = shows the QR code) — fixed ids so the backfill
--    below can join straight onto them.
INSERT INTO "PaymentMethod"
  ("id", "code", "name", "countsAsCash", "showQrCode", "isBuiltIn", "active", "sortOrder", "updatedAt")
VALUES
  ('paymentmethod_cash',      'CASH',      'Cash',           true,  false, true, true, 0, CURRENT_TIMESTAMP),
  ('paymentmethod_promptpay', 'PROMPTPAY', 'PromptPay / QR', false, true,  true, true, 1, CURRENT_TIMESTAMP),
  ('paymentmethod_card',      'CARD',      'Card',           false, false, true, true, 2, CURRENT_TIMESTAMP),
  ('paymentmethod_other',     'OTHER',     'Other',          false, false, true, true, 3, CURRENT_TIMESTAMP);

-- 4. Add the new Payment columns nullable first so existing rows can be
--    backfilled before NOT NULL is enforced.
ALTER TABLE "Payment" ADD COLUMN "methodId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "methodNameSnapshot" TEXT;

-- 5. Backfill every existing row from its old enum value (still intact
--    on "Payment"."method" — only the type was renamed, not the column).
UPDATE "Payment" p
SET
  "methodId" = pm."id",
  "methodNameSnapshot" = pm."name"
FROM "PaymentMethod" pm
WHERE pm."code" = p."method"::text;

-- 6. Enforce NOT NULL on the snapshot now that every row is backfilled.
--    methodId stays nullable (§45: a custom method can be force-deleted
--    later, this FK is SET NULL when that happens).
ALTER TABLE "Payment" ALTER COLUMN "methodNameSnapshot" SET NOT NULL;

-- 7. Drop the old enum column + type, now fully replaced.
ALTER TABLE "Payment" DROP COLUMN "method";
DROP TYPE "PaymentMethodOld";

-- 8. Wire up the new FK as SET NULL.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Payment_methodId_idx" ON "Payment"("methodId");
