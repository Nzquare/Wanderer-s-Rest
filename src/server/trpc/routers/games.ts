import { z } from "zod";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";

const statusEnum = z.enum(["AVAILABLE", "IN_USE", "MISSING", "DAMAGED", "ARCHIVED"]);

export const gamesRouter = router({
  listAll: staffProcedure.query(({ ctx }) => {
    return ctx.prisma.game.findMany({ orderBy: { nameEn: "asc" } });
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
        orderBy: { nameEn: "asc" },
        take: 30,
      });
    }),

  create: permissionProcedure(Permission.MANAGE_GAMES)
    .input(
      z.object({
        nameTh: z.string().min(1),
        nameEn: z.string().min(1),
        category: z.string().optional(),
        genre: z.string().optional(),
        cooperative: z.boolean().default(false),
        minPlayers: z.number().int().min(1).optional(),
        maxPlayers: z.number().int().min(1).optional(),
        estimatedMinutes: z.number().int().min(1).optional(),
        difficulty: z.string().optional(),
        totalQuantity: z.number().int().min(1).default(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { totalQuantity, ...rest } = input;
      return ctx.prisma.game.create({
        data: { ...rest, totalQuantity, availableQuantity: totalQuantity },
      });
    }),

  update: permissionProcedure(Permission.MANAGE_GAMES)
    .input(
      z.object({
        id: z.string(),
        status: statusEnum.optional(),
        active: z.boolean().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.game.update({ where: { id }, data });
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
        include: { game: true },
        orderBy: { playedAt: "desc" },
      });
    }),
});
