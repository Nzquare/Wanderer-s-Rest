import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";

export const tablesRouter = router({
  listAll: permissionProcedure(Permission.MANAGE_TABLES).query(({ ctx }) => {
    return ctx.prisma.restaurantTable.findMany({ orderBy: { sortOrder: "asc" } });
  }),

  // Read-only, used by the QR-code label render — any staff can view it.
  get: staffProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.prisma.restaurantTable.findUnique({ where: { id: input.id } });
    }),

  create: permissionProcedure(Permission.MANAGE_TABLES)
    .input(
      z.object({
        code: z.string().min(1).max(10),
        name: z.string().min(1),
        capacity: z.number().int().min(1).max(50),
        area: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.restaurantTable.findUnique({
        where: { code: input.code },
      });
      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Table code "${input.code}" is already in use.`,
        });
      }
      return ctx.prisma.restaurantTable.create({ data: input });
    }),

  update: permissionProcedure(Permission.MANAGE_TABLES)
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        capacity: z.number().int().min(1).max(50).optional(),
        area: z.string().optional(),
        notes: z.string().optional(),
        active: z.boolean().optional(),
        qrEnabled: z.boolean().optional(),
        status: z
          .enum([
            "AVAILABLE",
            "RESERVED",
            "CLEANING",
            "UNAVAILABLE",
            "CLOSED",
          ])
          .optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.restaurantTable.update({ where: { id }, data });
    }),
});
