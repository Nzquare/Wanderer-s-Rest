-- Hard per-role overrides on top of permission-based app access
-- (§GM restricted to Staff Mobile). Default false everywhere so no
-- existing role's access changes just from these columns existing.
ALTER TABLE "Role" ADD COLUMN "denyBackOfficeAccess" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Role" ADD COLUMN "denyCashierAccess" BOOLEAN NOT NULL DEFAULT false;
