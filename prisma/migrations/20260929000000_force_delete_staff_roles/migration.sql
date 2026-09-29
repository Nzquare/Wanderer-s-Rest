-- Force-delete staff/roles (§even the locked staff/role I don't use — I
-- just need to delete them, and reports should still show their name):
-- every relation that required a live Staff row now allows it to be
-- deleted, falling back to a permanent name snapshot taken at the moment
-- each record was created (same pattern as Payment.methodNameSnapshot).

-- ── AuditLog: snapshot the actor's name ─────────────────────────────────
ALTER TABLE "AuditLog" ADD COLUMN "actorNameSnapshot" TEXT;
UPDATE "AuditLog" a
SET "actorNameSnapshot" = COALESCE(s."displayName", s."name")
FROM "Staff" s
WHERE a."staffId" = s."id" AND a."actorNameSnapshot" IS NULL;

-- ── TableSession.createdById ────────────────────────────────────────────
ALTER TABLE "TableSession" ADD COLUMN "createdByNameSnapshot" TEXT;
UPDATE "TableSession" t
SET "createdByNameSnapshot" = COALESCE(s."displayName", s."name")
FROM "Staff" s
WHERE t."createdById" = s."id" AND t."createdByNameSnapshot" IS NULL;
ALTER TABLE "TableSession" DROP CONSTRAINT "TableSession_createdById_fkey";
ALTER TABLE "TableSession" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Payment.staffId ──────────────────────────────────────────────────────
ALTER TABLE "Payment" ADD COLUMN "staffNameSnapshot" TEXT;
UPDATE "Payment" p
SET "staffNameSnapshot" = COALESCE(s."displayName", s."name")
FROM "Staff" s
WHERE p."staffId" = s."id" AND p."staffNameSnapshot" IS NULL;
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_staffId_fkey";
ALTER TABLE "Payment" ALTER COLUMN "staffId" DROP NOT NULL;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Refund.staffId ───────────────────────────────────────────────────────
ALTER TABLE "Refund" ADD COLUMN "staffNameSnapshot" TEXT;
UPDATE "Refund" r
SET "staffNameSnapshot" = COALESCE(s."displayName", s."name")
FROM "Staff" s
WHERE r."staffId" = s."id" AND r."staffNameSnapshot" IS NULL;
ALTER TABLE "Refund" DROP CONSTRAINT "Refund_staffId_fkey";
ALTER TABLE "Refund" ALTER COLUMN "staffId" DROP NOT NULL;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── AppliedDiscount.appliedById ──────────────────────────────────────────
ALTER TABLE "AppliedDiscount" ADD COLUMN "appliedByNameSnapshot" TEXT;
UPDATE "AppliedDiscount" d
SET "appliedByNameSnapshot" = COALESCE(s."displayName", s."name")
FROM "Staff" s
WHERE d."appliedById" = s."id" AND d."appliedByNameSnapshot" IS NULL;
ALTER TABLE "AppliedDiscount" DROP CONSTRAINT "AppliedDiscount_appliedById_fkey";
ALTER TABLE "AppliedDiscount" ALTER COLUMN "appliedById" DROP NOT NULL;
ALTER TABLE "AppliedDiscount" ADD CONSTRAINT "AppliedDiscount_appliedById_fkey"
  FOREIGN KEY ("appliedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── GameSession.staffId ──────────────────────────────────────────────────
ALTER TABLE "GameSession" ADD COLUMN "staffNameSnapshot" TEXT;
UPDATE "GameSession" g
SET "staffNameSnapshot" = COALESCE(s."displayName", s."name")
FROM "Staff" s
WHERE g."staffId" = s."id" AND g."staffNameSnapshot" IS NULL;
ALTER TABLE "GameSession" DROP CONSTRAINT "GameSession_staffId_fkey";
ALTER TABLE "GameSession" ALTER COLUMN "staffId" DROP NOT NULL;
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── DndSession.staffId ───────────────────────────────────────────────────
ALTER TABLE "DndSession" ADD COLUMN "staffNameSnapshot" TEXT;
UPDATE "DndSession" d
SET "staffNameSnapshot" = COALESCE(s."displayName", s."name")
FROM "Staff" s
WHERE d."staffId" = s."id" AND d."staffNameSnapshot" IS NULL;
ALTER TABLE "DndSession" DROP CONSTRAINT "DndSession_staffId_fkey";
ALTER TABLE "DndSession" ALTER COLUMN "staffId" DROP NOT NULL;
ALTER TABLE "DndSession" ADD CONSTRAINT "DndSession_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Reservation.createdById ──────────────────────────────────────────────
ALTER TABLE "Reservation" ADD COLUMN "createdByNameSnapshot" TEXT;
UPDATE "Reservation" r
SET "createdByNameSnapshot" = COALESCE(s."displayName", s."name")
FROM "Staff" s
WHERE r."createdById" = s."id" AND r."createdByNameSnapshot" IS NULL;
ALTER TABLE "Reservation" DROP CONSTRAINT "Reservation_createdById_fkey";
ALTER TABLE "Reservation" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Shift.openedById ──────────────────────────────────────────────────────
ALTER TABLE "Shift" ADD COLUMN "openedByNameSnapshot" TEXT;
UPDATE "Shift" sh
SET "openedByNameSnapshot" = COALESCE(s."displayName", s."name")
FROM "Staff" s
WHERE sh."openedById" = s."id" AND sh."openedByNameSnapshot" IS NULL;
ALTER TABLE "Shift" DROP CONSTRAINT "Shift_openedById_fkey";
ALTER TABLE "Shift" ALTER COLUMN "openedById" DROP NOT NULL;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_openedById_fkey"
  FOREIGN KEY ("openedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
