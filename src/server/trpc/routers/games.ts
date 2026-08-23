import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { logAudit } from "@/server/audit";

export const gamesRouter = router({
  listAll: staffProcedure.query(({ ctx }) => {
    return ctx.prisma.game.findMany({
      include: { category: true },
      orderBy: { nameEn: "asc" },
    });
  }),

  /** Lightweight list for the "record a game" search during a table session. */
  listForRecording: staffProcedure
    .input(z.object({ query: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const q = input?.query?.trim();
      return ctx.prisma.game.findMany({
        where: {
          active: true,
          ...(q
            ? {
                OR: [
                  { nameEn: { contains: q, mode: "insensitive" } },
                  { nameTh: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: { category: true },
        orderBy: { nameEn: "asc" },
        take: 30,
      });
    }),

  create: permissionProcedure(Permission.MANAGE_GAMES)
    .input(
      z.object({
        nameTh: z.string().min(1),
        nameEn: z.string().min(1),
        categoryId: z.string().optional(),
        genre: z.string().optional(),
        minPlayers: z.number().int().min(1).optional(),
        maxPlayers: z.number().int().min(1).optional(),
        estimatedMinutes: z.number().int().min(1).optional(),
        difficulty: z.string().optional(),
        ageRecommendation: z.string().optional(),
        totalQuantity: z.number().int().min(1).default(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.game.create({ data: input });
    }),

  update: permissionProcedure(Permission.MANAGE_GAMES)
    .input(
      z.object({
        id: z.string(),
        nameTh: z.string().min(1).optional(),
        nameEn: z.string().min(1).optional(),
        categoryId: z.string().nullable().optional(),
        genre: z.string().nullable().optional(),
        minPlayers: z.number().int().min(1).nullable().optional(),
        maxPlayers: z.number().int().min(1).nullable().optional(),
        estimatedMinutes: z.number().int().min(1).nullable().optional(),
        difficulty: z.string().nullable().optional(),
        ageRecommendation: z.string().nullable().optional(),
        totalQuantity: z.number().int().min(0).optional(),
        active: z.boolean().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.game.update({ where: { id }, data });
    }),

  /**
   * True delete. Default is soft-blocked for a game that's ever been
   * recorded as played — steered to Inactive instead, same pattern as
   * menu items/categories/tables — but `force: true` (an explicit second
   * confirmation in the UI, §Delete a game) overrides that. Safe to do:
   * GameSession.gameId is nullable + SetNull (see schema comment), so a
   * deleted game's past plays stay on record, just no longer attributable
   * to a specific game (shown as "Deleted game" / "Unknown" instead of
   * losing the play).
   */
  delete: permissionProcedure(Permission.MANAGE_GAMES)
    .input(z.object({ id: z.string(), force: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const game = await ctx.prisma.game.findUnique({
        where: { id: input.id },
        include: { _count: { select: { gameSessions: true } } },
      });
      if (!game) throw new TRPCError({ code: "NOT_FOUND" });
      if (game._count.gameSessions > 0 && !input.force) {
        // CONFLICT (not BAD_REQUEST) so the UI can offer "Delete anyway".
        throw new TRPCError({
          code: "CONFLICT",
          message: `"${game.nameEn}" has been recorded as played and can't be deleted — mark it Inactive instead to take it off the library, or delete it anyway if you're sure.`,
        });
      }
      await ctx.prisma.game.delete({ where: { id: input.id } });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "GAME_DELETED",
        entityType: "Game",
        entityId: input.id,
        previousValue: {
          nameEn: game.nameEn,
          hadPlayHistory: game._count.gameSessions > 0,
        },
      });
      return { ok: true };
    }),

  // --- Categories (§34) --------------------------------------------------
  // A managed list instead of free text, so it stays consistent across
  // the library.

  listCategories: staffProcedure.query(({ ctx }) => {
    return ctx.prisma.gameCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { games: true } } },
    });
  }),

  createCategory: permissionProcedure(Permission.MANAGE_GAMES)
    .input(z.object({ nameTh: z.string().min(1), nameEn: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const last = await ctx.prisma.gameCategory.findFirst({
        orderBy: { sortOrder: "desc" },
      });
      return ctx.prisma.gameCategory.create({
        data: { ...input, sortOrder: (last?.sortOrder ?? -1) + 1 },
      });
    }),

  updateCategory: permissionProcedure(Permission.MANAGE_GAMES)
    .input(
      z.object({
        id: z.string(),
        nameTh: z.string().min(1).optional(),
        nameEn: z.string().min(1).optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.gameCategory.update({ where: { id }, data });
    }),

  /** True delete — only for a category no game currently uses. */
  deleteCategory: permissionProcedure(Permission.MANAGE_GAMES)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const category = await ctx.prisma.gameCategory.findUnique({
        where: { id: input.id },
        include: { _count: { select: { games: true } } },
      });
      if (!category) throw new TRPCError({ code: "NOT_FOUND" });
      if (category._count.games > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${category.nameEn}" is still used by ${category._count.games} game(s) — move them to another category first, or mark it Inactive instead.`,
        });
      }
      await ctx.prisma.gameCategory.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /** Attach a played game to the current table session (§35) — Tavern Keeper-level action. */
  recordPlay: permissionProcedure(Permission.MANAGE_GAMES)
    .input(z.object({ sessionId: z.string(), gameId: z.string(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.tableSession.findUnique({
        where: { id: input.sessionId },
      });
      const gameSession = await ctx.prisma.gameSession.create({
        data: {
          sessionId: input.sessionId,
          gameId: input.gameId,
          memberId: session?.memberId,
          staffId: ctx.staff.id,
          notes: input.notes,
        },
      });
      return { id: gameSession.id };
    }),

  removePlay: permissionProcedure(Permission.MANAGE_GAMES)
    .input(z.object({ gameSessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.gameSession.delete({ where: { id: input.gameSessionId } });
      return { ok: true };
    }),

  listForSession: staffProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.prisma.gameSession.findMany({
        where: { sessionId: input.sessionId },
        include: { game: { include: { category: true } } },
        orderBy: { playedAt: "desc" },
      });
    }),
});
