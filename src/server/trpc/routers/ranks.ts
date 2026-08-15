import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { logAudit } from "@/server/audit";

// Rank tiers are financial/business configuration in the same spirit as
// Pricing Types and Settings — gated behind MANAGE_SETTINGS rather than a
// dedicated new Permission enum value (§Rank management).
const manage = () => permissionProcedure(Permission.MANAGE_SETTINGS);

const rankShape = z.object({
  nameTh: z.string().min(1),
  nameEn: z.string().min(1),
  icon: z.string().optional(),
  descriptionTh: z.string().optional(),
  descriptionEn: z.string().optional(),
  // How many levels this tier spans before the next rank kicks in —
  // resolveRank (src/server/domain/exp.ts) walks the ordered rank list
  // and subtracts each one's levelsRequired to find where a member's
  // total level lands. The last configured rank absorbs everything
  // beyond it uncapped, so it never "runs out."
  levelsRequired: z.number().int().min(1),
});

export const ranksRouter = router({
  /** Ordered, for pickers (Adjust Rank, progression calc) — any staff can read. */
  list: staffProcedure.query(({ ctx }) => {
    return ctx.prisma.rank.findMany({ orderBy: { order: "asc" } });
  }),

  /** Back Office management list — includes how many members currently hold each rank. */
  listAll: manage().query(async ({ ctx }) => {
    const ranks = await ctx.prisma.rank.findMany({
      orderBy: { order: "asc" },
      include: { _count: { select: { members: true } } },
    });
    return ranks.map((r) => ({ ...r, memberCount: r._count.members }));
  }),

  create: manage()
    .input(rankShape)
    .mutation(async ({ ctx, input }) => {
      // New ranks always land after every existing one — otherwise a
      // blank/default order would interleave it unpredictably with the
      // existing ladder instead of appending to the top.
      const last = await ctx.prisma.rank.findFirst({ orderBy: { order: "desc" } });
      const created = await ctx.prisma.rank.create({
        data: { ...input, order: (last?.order ?? -1) + 1 },
      });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "RANK_CREATED",
        entityType: "Rank",
        entityId: created.id,
        newValue: { nameEn: created.nameEn, levelsRequired: created.levelsRequired },
      });
      return created;
    }),

  update: manage()
    .input(rankShape.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.rank.update({ where: { id }, data });
    }),

  /**
   * Drag-and-drop reorder: the client sends every id in its new
   * top-to-bottom order, and this renumbers `order` to match (0, 1, 2,
   * ...) in one batch — same shape as pricingTypes.reorder /
   * menu.reorderCategories. This is also the resolution order
   * resolveRank walks, so reordering here changes which rank a given
   * total level actually falls into.
   */
  reorder: manage()
    .input(z.object({ orderedIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const ranks = await ctx.prisma.rank.findMany({
        where: { id: { in: input.orderedIds } },
      });
      const byId = new Map(ranks.map((r) => [r.id, r]));
      const updates = input.orderedIds
        .map((id, index) => ({ existing: byId.get(id), order: index }))
        .filter(
          (row): row is { existing: NonNullable<typeof row.existing>; order: number } =>
            !!row.existing && row.existing.order !== row.order,
        )
        .map((row) =>
          ctx.prisma.rank.update({
            where: { id: row.existing.id },
            data: { order: row.order },
          }),
        );
      await ctx.prisma.$transaction(updates);
      return { ok: true };
    }),

  /**
   * True delete — only for a rank no member currently holds. There's no
   * "inactive" concept for a rank the way there is for a menu item or
   * pricing type (§45) — the ladder is always the live ladder — so a rank
   * with members on it can't be removed at all; move them off it first
   * (Adjust Rank on their profile) or just edit this rank's fields
   * instead of deleting it.
   */
  remove: manage()
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rank = await ctx.prisma.rank.findUnique({
        where: { id: input.id },
        include: { _count: { select: { members: true } } },
      });
      if (!rank) throw new TRPCError({ code: "NOT_FOUND" });
      if (rank._count.members > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${rank._count.members} member(s) currently hold "${rank.nameEn}" — move them to a different rank first (Adjust Rank on their profile), or edit this rank instead of deleting it.`,
        });
      }
      await ctx.prisma.rank.delete({ where: { id: input.id } });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "RANK_DELETED",
        entityType: "Rank",
        entityId: input.id,
        previousValue: { nameEn: rank.nameEn },
      });
      return { ok: true };
    }),
});
