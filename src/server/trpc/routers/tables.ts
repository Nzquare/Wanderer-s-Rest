import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { logAudit } from "@/server/audit";

export const tablesRouter = router({
  // Quick Sale tables (walk-in/delivery/split — kind !== STANDARD) are
  // created on the fly from the Cashier/Staff "Quick Sale" tab, not here —
  // the floor-plan table manager only ever deals with real, physical
  // tables (§Quick Sale).
  listAll: permissionProcedure(Permission.MANAGE_TABLES).query(({ ctx }) => {
    return ctx.prisma.restaurantTable.findMany({
      where: { kind: "STANDARD" },
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

  /**
   * "+ New" on the Quick Sale tab (§Quick Sale) — a walk-in counter sale or
   * a delivery order, neither tied to a physical table. Creates a bare
   * AVAILABLE RestaurantTable with no QR (nothing to scan) so it flows
   * through the exact same OpenTableForm/openTable/checkout path a real
   * table does; the only difference is `kind`, which keeps it off the
   * floor-plan grid and Back Office's table manager and puts it on the
   * Quick Sale list instead. Codes count up per kind, e.g. W1, W2, D1 —
   * counted across all-time (never reused, tables are never deleted) so
   * two staff creating one at the same moment can still collide only in
   * the (harmless) rare case of a duplicate label, never a duplicate code
   * conflict silently overwriting one row's data.
   */
  createQuickSale: permissionProcedure(Permission.MANAGE_TABLES)
    .input(z.object({ kind: z.enum(["WALK_IN", "DELIVERY"]) }))
    .mutation(async ({ ctx, input }) => {
      const prefix = input.kind === "WALK_IN" ? "W" : "D";
      const label = input.kind === "WALK_IN" ? "Walk-in" : "Delivery";
      const count = await ctx.prisma.restaurantTable.count({
        where: { kind: input.kind },
      });
      const n = count + 1;
      const table = await ctx.prisma.restaurantTable.create({
        data: {
          code: `${prefix}${n}`,
          name: `${label} ${n}`,
          capacity: 8,
          kind: input.kind,
          qrEnabled: false,
          sortOrder: 0,
        },
      });
      return table;
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
