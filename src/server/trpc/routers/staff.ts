import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, permissionProcedure } from "../trpc";
import { Permission, ALL_PERMISSIONS } from "@/server/rbac/permissions";
import { hashSecret } from "@/server/auth/password";

const manageStaff = () => permissionProcedure(Permission.MANAGE_STAFF);

export const staffRouter = router({
  list: manageStaff().query(({ ctx }) => {
    return ctx.prisma.staff.findMany({
      include: { role: true },
      orderBy: { createdAt: "asc" },
    });
  }),

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
    .mutation(({ ctx, input }) => {
      return ctx.prisma.staff.update({
        where: { id: input.staffId },
        data: { status: input.status },
      });
    }),

  setRole: manageStaff()
    .input(z.object({ staffId: z.string(), roleId: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.staff.update({
        where: { id: input.staffId },
        data: { roleId: input.roleId },
      });
    }),

  resetPin: manageStaff()
    .input(z.object({ staffId: z.string(), newPin: z.string().min(4).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const pinHash = await hashSecret(input.newPin);
      await ctx.prisma.staff.update({
        where: { id: input.staffId },
        data: { pinHash },
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
      await ctx.prisma.$transaction([
        ctx.prisma.rolePermission.deleteMany({ where: { roleId: input.roleId } }),
        ctx.prisma.rolePermission.createMany({
          data: input.permissions.map((permission) => ({
            roleId: input.roleId,
            permission,
          })),
        }),
      ]);
      return { ok: true };
    }),
});
