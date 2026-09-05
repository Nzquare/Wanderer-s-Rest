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
    });
    const byMethod = { CASH: 0, PROMPTPAY: 0, CARD: 0, OTHER: 0 };
    for (const p of payments) byMethod[p.method] += toNum(p.amount);
    const totalSales = Object.values(byMethod).reduce((a, b) => a + b, 0);
    const expectedCash = toNum(shift.startingCash) + byMethod.CASH;

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
      const payments = await ctx.prisma.payment.findMany({
        where: { shiftId: shift.id, status: "COMPLETED", method: "CASH" },
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
      const payments = await ctx.prisma.payment.findMany({
        where: { shiftId: shift.id, status: "COMPLETED", method: "CASH" },
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
