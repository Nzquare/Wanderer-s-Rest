import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Writes one audit trail entry (§43). Called from the handful of mutations
 * the spec calls out by name — price changes, EXP adjustments, permission
 * changes, voids/refunds, etc. Never blocks or throws on failure to log;
 * an audit write going wrong should never take down the action it's
 * describing.
 */
export async function logAudit(
  db: PrismaClient | Prisma.TransactionClient,
  entry: {
    staffId: string | null;
    action: string;
    entityType: string;
    entityId?: string;
    previousValue?: unknown;
    newValue?: unknown;
    reason?: string;
  },
) {
  try {
    // Looked up here rather than passed in, so none of this function's ~40
    // call sites need to change (§force delete staff/roles) — a staff
    // account deleted later still leaves every entry it ever wrote
    // readable by name instead of falling back to "System".
    const actor = entry.staffId
      ? await db.staff.findUnique({ where: { id: entry.staffId }, select: { name: true } })
      : null;
    await db.auditLog.create({
      data: {
        staffId: entry.staffId,
        actorNameSnapshot: actor?.name,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        previousValue:
          entry.previousValue === undefined
            ? undefined
            : JSON.parse(JSON.stringify(entry.previousValue)),
        newValue:
          entry.newValue === undefined ? undefined : JSON.parse(JSON.stringify(entry.newValue)),
        reason: entry.reason,
      },
    });
  } catch {
    // Never let audit logging break the underlying action.
  }
}
