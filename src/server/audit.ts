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
    await db.auditLog.create({
      data: {
        staffId: entry.staffId,
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
