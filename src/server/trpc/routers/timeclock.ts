import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { verifyStaffSecret } from "@/server/auth/password";
import { logAudit } from "@/server/audit";

const manageStaff = () => permissionProcedure(Permission.MANAGE_STAFF);

export const timeClockRouter = router({
  /**
   * Who's currently on the clock — visible to any signed-in staff with no
   * PIN needed just to look, shown on the Cashier clock page so it's
   * obvious at a glance who's in without anyone having to ask around.
   */
  listOpen: staffProcedure.query(({ ctx }) => {
    return ctx.prisma.timeClockEntry.findMany({
      where: { clockOut: null },
      select: { id: true, staffId: true, staffNameSnapshot: true, clockIn: true },
      orderBy: { clockIn: "asc" },
    });
  }),

  /**
   * Cashier POS is one shared terminal login, not one login per person
   * (§clock in/out for staff), so clocking in re-verifies the picked
   * staff member's own PIN — same "pick who, then their PIN" shape as
   * void/refund attribution — rather than trusting whoever happens to be
   * signed into the terminal right now.
   */
  clockIn: staffProcedure
    .input(z.object({ staffId: z.string(), pin: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const staff = await ctx.prisma.staff.findUnique({ where: { id: input.staffId } });
      if (!staff || staff.status !== "ACTIVE") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Select a valid active staff member." });
      }
      if (!(await verifyStaffSecret(staff, input.pin))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect PIN." });
      }
      const alreadyOpen = await ctx.prisma.timeClockEntry.findFirst({
        where: { staffId: staff.id, clockOut: null },
      });
      if (alreadyOpen) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${staff.name} is already clocked in since ${alreadyOpen.clockIn.toLocaleTimeString()}.`,
        });
      }
      return ctx.prisma.timeClockEntry.create({
        data: {
          staffId: staff.id,
          staffNameSnapshot: staff.displayName ?? staff.name,
          clockIn: new Date(),
        },
      });
    }),

  clockOut: staffProcedure
    .input(z.object({ staffId: z.string(), pin: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const staff = await ctx.prisma.staff.findUnique({ where: { id: input.staffId } });
      if (!staff) throw new TRPCError({ code: "BAD_REQUEST", message: "Select a valid staff member." });
      if (!(await verifyStaffSecret(staff, input.pin))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect PIN." });
      }
      const open = await ctx.prisma.timeClockEntry.findFirst({
        where: { staffId: staff.id, clockOut: null },
        orderBy: { clockIn: "desc" },
      });
      if (!open) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${staff.name} isn't currently clocked in.` });
      }
      return ctx.prisma.timeClockEntry.update({
        where: { id: open.id },
        data: { clockOut: new Date() },
      });
    }),

  /**
   * Back Office correction — a forgotten clock-out (or any other mistake)
   * has to be fixable by someone, since nothing stops staff from just not
   * clocking out. Reused for both editing times and manually closing a
   * still-open entry (clockOut: null clears it back to still-open, a real
   * timestamp closes or corrects it).
   */
  update: manageStaff()
    .input(
      z.object({
        id: z.string(),
        clockIn: z.string().optional(),
        clockOut: z.string().nullable().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.prisma.timeClockEntry.findUnique({ where: { id: input.id } });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const updated = await ctx.prisma.timeClockEntry.update({
        where: { id: input.id },
        data: {
          clockIn: input.clockIn ? new Date(input.clockIn) : undefined,
          clockOut:
            input.clockOut === undefined ? undefined : input.clockOut ? new Date(input.clockOut) : null,
          notes: input.notes,
        },
      });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "TIME_CLOCK_EDITED",
        entityType: "TimeClockEntry",
        entityId: input.id,
        previousValue: { clockIn: before.clockIn, clockOut: before.clockOut },
        newValue: { clockIn: updated.clockIn, clockOut: updated.clockOut },
      });
      return updated;
    }),

  /** A correction tool for a genuinely wrong entry (duplicate, wrong person picked), not an everyday action. */
  delete: manageStaff()
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.prisma.timeClockEntry.findUnique({ where: { id: input.id } });
      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.prisma.timeClockEntry.delete({ where: { id: input.id } });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "TIME_CLOCK_DELETED",
        entityType: "TimeClockEntry",
        entityId: input.id,
        previousValue: { staffName: entry.staffNameSnapshot, clockIn: entry.clockIn },
      });
      return { ok: true };
    }),
});
