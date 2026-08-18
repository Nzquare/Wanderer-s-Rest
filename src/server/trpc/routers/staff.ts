import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, permissionProcedure, staffProcedure } from "../trpc";
import { Permission, ALL_PERMISSIONS } from "@/server/rbac/permissions";
import { hashSecret } from "@/server/auth/password";
import { logAudit } from "@/server/audit";

const manageStaff = () => permissionProcedure(Permission.MANAGE_STAFF);

export const staffRouter = router({
  list: manageStaff().query(({ ctx }) => {
    return ctx.prisma.staff.findMany({
      include: { role: true },
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
});
