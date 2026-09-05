import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, permissionProcedure, cashierProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { toNum } from "@/lib/decimal";
import { logAudit } from "@/server/audit";

export const shiftsRouter = router({
  getCurrent: cashierProcedure.query(async ({ ctx }) => {
    const shift = await ctx.prisma.shift.findFirst({
      where: { status: "OPEN" },
      orderBy: { openedAt: "desc" },
      include: { openedBy: { select: { name: true } } },
    });
    if (!shift) return null;

    const payments = await ctx.prisma.payment.findMany({
      where: { shiftId: shift.id, status: "COMPLETED" },
      select: {
        amount: true,
        methodId: true,
        methodNameSnapshot: true,
        method: { select: { countsAsCash: true, sortOrder: true } },
      },
    });
    // Grouped by whichever payment methods actually got used this shift
    // (§Payment methods — manage your own) rather than a fixed
    // CASH/PROMPTPAY/CARD/OTHER shape — a café could take a payment
    // through any custom method (Line Man, Grab, ...) too. Keyed by
    // methodId when the method still exists, falling back to the frozen
    // name for one that's since been force-deleted (still grouped
    // correctly, just with no live countsAsCash to read — treated as not
    // cash, the safe default per PaymentMethod's own doc comment).
    const byMethodMap = new Map<
      string,
      { methodId: string | null; name: string; total: number; countsAsCash: boolean; sortOrder: number }
    >();
    for (const p of payments) {
      const key = p.methodId ?? `deleted:${p.methodNameSnapshot}`;
      const existing = byMethodMap.get(key) ?? {
        methodId: p.methodId,
        name: p.methodNameSnapshot,
        total: 0,
        countsAsCash: p.method?.countsAsCash ?? false,
        sortOrder: p.method?.sortOrder ?? 999,
      };
      existing.total += toNum(p.amount);
      byMethodMap.set(key, existing);
    }
    const byMethod = Array.from(byMethodMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
    const totalSales = byMethod.reduce((s, m) => s + m.total, 0);
    const cashTotal = byMethod.filter((m) => m.countsAsCash).reduce((s, m) => s + m.total, 0);
    const expectedCash = toNum(shift.startingCash) + cashTotal;

    return {
      id: shift.id,
      openedAt: shift.openedAt,
      startingCash: toNum(shift.startingCash),
      openedByName: shift.openedBy.name,
      byMethod,
      totalSales,
      expectedCash,
      paymentCount: payments.length,
    };
  }),

  open: permissionProcedure(Permission.OPEN_SHIFT)
    .input(z.object({ startingCash: z.number().min(0), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.shift.findFirst({
        where: { status: "OPEN" },
      });
      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A shift is already open.",
        });
      }
      const shift = await ctx.prisma.shift.create({
        data: {
          openedById: ctx.staff.id,
          startingCash: input.startingCash,
          notes: input.notes,
        },
      });
      return { shiftId: shift.id };
    }),

  close: permissionProcedure(Permission.CLOSE_SHIFT)
    .input(
      z.object({
        shiftId: z.string(),
        actualCashCounted: z.number().min(0),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const shift = await ctx.prisma.shift.findUnique({
        where: { id: input.shiftId },
      });
      if (!shift || shift.status !== "OPEN") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Shift is not open." });
      }
      // Only payments through a method flagged countsAsCash count toward
      // the physical drawer (§Payment methods — manage your own) — a
      // relation filter naturally excludes a payment whose method was
      // since force-deleted (methodId null), which is the safe default.
      const payments = await ctx.prisma.payment.findMany({
        where: { shiftId: shift.id, status: "COMPLETED", method: { countsAsCash: true } },
      });
      const cashTotal = payments.reduce((s, p) => s + toNum(p.amount), 0);
      const expectedCash = toNum(shift.startingCash) + cashTotal;
      const cashDifference = input.actualCashCounted - expectedCash;

      await ctx.prisma.shift.update({
        where: { id: shift.id },
        data: {
          status: "CLOSED",
          closedById: ctx.staff.id,
          closedAt: new Date(),
          actualCashCounted: input.actualCashCounted,
          expectedCash,
          cashDifference,
          notes: input.notes ?? shift.notes,
        },
      });

      return { expectedCash, actualCashCounted: input.actualCashCounted, cashDifference };
    }),

  /**
   * Closes an abandoned shift with no physical cash count (§Automatic
   * shift close) — for when whoever had it open is gone and it's blocking
   * a new shift from opening (only one may be OPEN at a time), not a
   * substitute for the normal close above. actualCashCounted/
   * cashDifference are deliberately left null, unlike a normal close,
   * since there's nothing to compare — a shift closed this way is never
   * mistakable for a reconciled one. The reason is required and goes on
   * the shift's own notes (same "[TAG by name: reason]" convention
   * voidSession/refundSession already use) as well as the audit log, so
   * it's clear on the shift itself why no count happened.
   */
  forceClose: permissionProcedure(Permission.CLOSE_SHIFT)
    .input(z.object({ shiftId: z.string(), reason: z.string().min(1).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const shift = await ctx.prisma.shift.findUnique({ where: { id: input.shiftId } });
      if (!shift || shift.status !== "OPEN") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Shift is not open." });
      }
      // Only payments through a method flagged countsAsCash count toward
      // the physical drawer (§Payment methods — manage your own) — a
      // relation filter naturally excludes a payment whose method was
      // since force-deleted (methodId null), which is the safe default.
      const payments = await ctx.prisma.payment.findMany({
        where: { shiftId: shift.id, status: "COMPLETED", method: { countsAsCash: true } },
      });
      const cashTotal = payments.reduce((s, p) => s + toNum(p.amount), 0);
      const expectedCash = toNum(shift.startingCash) + cashTotal;

      await ctx.prisma.shift.update({
        where: { id: shift.id },
        data: {
          status: "CLOSED",
          closedById: ctx.staff.id,
          closedAt: new Date(),
          expectedCash,
          notes: shift.notes
            ? `${shift.notes}\n[FORCE-CLOSED by ${ctx.staff.name}: ${input.reason}]`
            : `[FORCE-CLOSED by ${ctx.staff.name}: ${input.reason}]`,
        },
      });

      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "SHIFT_FORCE_CLOSED",
        entityType: "Shift",
        entityId: shift.id,
        newValue: { expectedCash },
        reason: input.reason,
      });

      return { ok: true, expectedCash };
    }),
});
