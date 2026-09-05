-- PromptPay / QR shows before Cash in the checkout payment picker (and
-- everywhere else PaymentMethod.sortOrder drives display order) — swaps
-- the two built-ins' sortOrder from the previous migration's seed
-- (Cash: 0, PromptPay: 1) to (PromptPay: 0, Cash: 1). Matched by `code`,
-- which stays stable even if a café has since renamed either one.
UPDATE "PaymentMethod" SET "sortOrder" = 0 WHERE "code" = 'PROMPTPAY';
UPDATE "PaymentMethod" SET "sortOrder" = 1 WHERE "code" = 'CASH';
