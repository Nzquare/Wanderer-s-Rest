import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { logAudit } from "@/server/audit";

export const tablesRouter = router({
  listAll: permissionProcedure(Permission.MANAGE_TABLES).query(({ ctx }) => {
    return ctx.prisma.restaurantTable.findMany({
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
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
      // New tables always land after every existing one — otherwise they'd
      // all share sortOrder's default of 0 and interleave unpredictably
      // with the seeded tables instead of appending to the end.
      const last = await ctx.prisma.restaurantTable.findFirst({
        orderBy: { sortOrder: "desc" },
      });
      return ctx.prisma.restaurantTable.create({
        data: { ...input, sortOrder: (last?.sortOrder ?? -1) + 1 },
      });
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

  /**
   * True delete — only allowed for a table that has never actually been
   * used (no sessions, no reservations), e.g. a duplicate or a typo just
   * created. A table with real history can't be deleted (§45: historical
   * records must never disappear) — deactivate it with `update` instead,
   * which hides it everywhere it's used operationally without losing
   * anything it's linked to.
   */
  remove: permissionProcedure(Permission.MANAGE_TABLES)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const table = await ctx.prisma.restaurantTable.findUnique({
        where: { id: input.id },
        include: { _count: { select: { sessions: true, reservations: true } } },
      });
      if (!table) throw new TRPCError({ code: "NOT_FOUND" });
      if (table._count.sessions > 0 || table._count.reservations > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${table.code} has session or reservation history and can't be deleted — mark it Inactive instead to remove it from use.`,
        });
      }
      await ctx.prisma.restaurantTable.delete({ where: { id: input.id } });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "TABLE_DELETED",
        entityType: "RestaurantTable",
        entityId: input.id,
        previousValue: { code: table.code, name: table.name },
      });
      return { ok: true };
    }),
});
