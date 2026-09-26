import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, permissionProcedure, staffProcedure } from "../trpc";
import { Permission, ALL_PERMISSIONS } from "@/server/rbac/permissions";
import { hashSecret } from "@/server/auth/password";
import { logAudit } from "@/server/audit";

const manageStaff = () => permissionProcedure(Permission.MANAGE_STAFF);

/**
 * Every relation Staff is referenced from (§Staff delete) — a staff row
 * can only ever be hard-deleted if every one of these is zero, since all
 * of them are required (non-nullable) foreign keys elsewhere: an order,
 * payment, shift, etc. must always say who actually did it, so none of
 * that history can ever be reassigned or dropped just to allow a delete.
 * A staff member with any of this on record can only be marked Inactive.
 */
const STAFF_ACTIVITY_COUNTS = {
  auditLogs: true,
  createdSessions: true,
  closedSessions: true,
  addedPlayers: true,
  orders: true,
  payments: true,
  issuedRefunds: true,
  approvedRefunds: true,
  appliedDiscounts: true,
  approvedDiscountOverrides: true,
  expAdjustments: true,
  awardedAchievements: true,
  redeemedBenefits: true,
  grantedBenefits: true,
  recordedGames: true,
  createdReservations: true,
  openedShifts: true,
  closedShifts: true,
  dndSessionsRun: true,
} as const;

export const staffRouter = router({
  list: manageStaff().query(({ ctx }) => {
    return ctx.prisma.staff.findMany({
      include: { role: true, _count: { select: STAFF_ACTIVITY_COUNTS } },
      orderBy: { createdAt: "asc" },
    });
  }),

  /**
   * Bare id/name list of active staff — any signed-in staff member can
   * read this (no sensitive fields), used for "assign to staff" pickers
   * like void/refund where the record needs to reflect who's actually
   * accountable, not necessarily whoever is clicking the button.
   */
  listActive: staffProcedure.query(({ ctx }) => {
    return ctx.prisma.staff.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }),

  /** Just enough to default an "assign to staff" picker to whoever's logged in. */
  me: staffProcedure.query(({ ctx }) => ({ id: ctx.staff.id, name: ctx.staff.name })),

  listRoles: manageStaff().query(({ ctx }) => {
    return ctx.prisma.role.findMany({
      include: { permissions: true },
      orderBy: { createdAt: "asc" },
    });
  }),

  allPermissions: manageStaff().query(() => ALL_PERMISSIONS),

  create: manageStaff()
    .input(
      z.object({
        name: z.string().min(1),
        loginId: z
          .string()
          .min(2)
          .max(30)
          .regex(/^[a-z0-9._-]+$/i, "Letters, numbers, . _ - only"),
        pin: z.string().min(4).max(20),
        roleId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.staff.findUnique({
        where: { loginId: input.loginId },
      });
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Login ID is taken." });
      }
      const pinHash = await hashSecret(input.pin);
      return ctx.prisma.staff.create({
        data: {
          name: input.name,
          loginId: input.loginId,
          pinHash,
          roleId: input.roleId,
          startDate: new Date(),
        },
      });
    }),

  update: manageStaff()
    .input(
      z.object({
        staffId: z.string(),
        name: z.string().min(1).optional(),
        loginId: z
          .string()
          .min(2)
          .max(30)
          .regex(/^[a-z0-9._-]+$/i, "Letters, numbers, . _ - only")
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { staffId, ...data } = input;
      if (data.loginId) {
        const existing = await ctx.prisma.staff.findUnique({ where: { loginId: data.loginId } });
        if (existing && existing.id !== staffId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Login ID is taken." });
        }
      }
      const before = await ctx.prisma.staff.findUnique({ where: { id: staffId } });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const updated = await ctx.prisma.staff.update({ where: { id: staffId }, data });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "STAFF_UPDATED",
        entityType: "Staff",
        entityId: staffId,
        previousValue: { name: before.name, loginId: before.loginId },
        newValue: data,
      });
      return updated;
    }),

  /**
   * True delete — for a staff account that was created and never actually
   * used (§delete the one I don't use), not for removing someone's real
   * history. Only allowed when every relation in STAFF_ACTIVITY_COUNTS is
   * zero; anyone who's ever taken an order, opened a shift, processed a
   * payment, etc. can only be marked Inactive instead, same as the setStatus
   * toggle already does — that activity is exactly what a bill/shift/report
   * needs to keep saying who actually did it.
   */
  delete: manageStaff()
    .input(z.object({ staffId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.staffId === ctx.staff.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't delete the account you're currently signed in as.",
        });
      }
      const staff = await ctx.prisma.staff.findUnique({
        where: { id: input.staffId },
        include: { _count: { select: STAFF_ACTIVITY_COUNTS } },
      });
      if (!staff) throw new TRPCError({ code: "NOT_FOUND" });
      const totalActivity = Object.values(staff._count).reduce((a, b) => a + b, 0);
      if (totalActivity > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${staff.name}" has activity on record (orders, shifts, payments, etc.) and can't be deleted — mark them Inactive instead.`,
        });
      }
      await ctx.prisma.staff.delete({ where: { id: input.staffId } });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "STAFF_DELETED",
        entityType: "Staff",
        entityId: input.staffId,
        previousValue: { name: staff.name, loginId: staff.loginId },
      });
      return { ok: true };
    }),

  setStatus: manageStaff()
    .input(z.object({ staffId: z.string(), status: z.enum(["ACTIVE", "INACTIVE"]) }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.prisma.staff.findUnique({ where: { id: input.staffId } });
      const updated = await ctx.prisma.staff.update({
        where: { id: input.staffId },
        data: { status: input.status },
      });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "STAFF_STATUS_CHANGE",
        entityType: "Staff",
        entityId: input.staffId,
        previousValue: { status: before?.status },
        newValue: { status: input.status },
      });
      return updated;
    }),

  setRole: manageStaff()
    .input(z.object({ staffId: z.string(), roleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.prisma.staff.findUnique({ where: { id: input.staffId } });
      const updated = await ctx.prisma.staff.update({
        where: { id: input.staffId },
        data: { roleId: input.roleId },
      });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "ROLE_CHANGE",
        entityType: "Staff",
        entityId: input.staffId,
        previousValue: { roleId: before?.roleId },
        newValue: { roleId: input.roleId },
      });
      return updated;
    }),

  resetPin: manageStaff()
    .input(z.object({ staffId: z.string(), newPin: z.string().min(4).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const pinHash = await hashSecret(input.newPin);
      await ctx.prisma.staff.update({
        where: { id: input.staffId },
        data: { pinHash },
      });
      // Resetting someone else's login credential was the one action in
      // this file with no audit trail at all — every sibling mutation
      // here (status, role, permissions) already logs one.
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "STAFF_PIN_RESET",
        entityType: "Staff",
        entityId: input.staffId,
      });
      return { ok: true };
    }),

  createRole: manageStaff()
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.role.findUnique({
        where: { name: input.name },
      });
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Role name is taken." });
      }
      // Custom roles start with no permissions — Owner/Manager grant them
      // deliberately from the editor, nothing sneaks in by default.
      return ctx.prisma.role.create({ data: { name: input.name } });
    }),

  updateRolePermissions: manageStaff()
    .input(
      z.object({
        roleId: z.string(),
        permissions: z.array(z.nativeEnum(Permission)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.prisma.rolePermission.findMany({
        where: { roleId: input.roleId },
      });
      await ctx.prisma.$transaction([
        ctx.prisma.rolePermission.deleteMany({ where: { roleId: input.roleId } }),
        ctx.prisma.rolePermission.createMany({
          data: input.permissions.map((permission) => ({
            roleId: input.roleId,
            permission,
          })),
        }),
      ]);
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "PERMISSION_CHANGE",
        entityType: "Role",
        entityId: input.roleId,
        previousValue: { permissions: before.map((p) => p.permission) },
        newValue: { permissions: input.permissions },
      });
      return { ok: true };
    }),

  /**
   * Hard overrides on which apps a role can open, independent of its
   * permissions (§GM restricted to Staff Mobile) — some permissions
   * (Manage games, Manage members, Manage reservations, ...) are needed
   * for legitimate Staff Mobile actions but would otherwise also open
   * Back Office/Cashier just by being present on the role. See
   * canAccessBackOffice/canAccessCashier.
   */
  updateAppAccess: manageStaff()
    .input(
      z.object({
        roleId: z.string(),
        denyBackOfficeAccess: z.boolean(),
        denyCashierAccess: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { roleId, ...data } = input;
      const before = await ctx.prisma.role.findUnique({ where: { id: roleId } });
      const updated = await ctx.prisma.role.update({ where: { id: roleId }, data });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "ROLE_APP_ACCESS_CHANGE",
        entityType: "Role",
        entityId: roleId,
        previousValue: {
          denyBackOfficeAccess: before?.denyBackOfficeAccess,
          denyCashierAccess: before?.denyCashierAccess,
        },
        newValue: data,
      });
      return updated;
    }),
});
