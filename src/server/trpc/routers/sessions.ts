import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { toNum, toNumOrNull } from "@/lib/decimal";
import {
  computeTableFee,
  type PlayerTimeRecord,
  type PricingTypeConfig,
} from "@/server/domain/pricing";
import type { Prisma } from "@/generated/prisma/client";

const ACTIVE_SESSION_STATUSES = [
  "OPEN",
  "PAUSED",
  "READY_FOR_CHECKOUT",
  "CHECKOUT_IN_PROGRESS",
] as const;

function toPlayerRecord(p: {
  id: string;
  startTime: Date;
  pausedAt: Date | null;
  accumulatedPausedMs: bigint;
  endTime: Date | null;
  status: "ACTIVE" | "PAUSED" | "STOPPED";
}): PlayerTimeRecord {
  return {
    id: p.id,
    startTime: p.startTime,
    pausedAt: p.pausedAt,
    accumulatedPausedMs: Number(p.accumulatedPausedMs),
    endTime: p.endTime,
    status: p.status,
  };
}

function toPricingConfig(pt: {
  model: "HOURLY" | "FIXED" | "PACKAGE";
  hourlyRate: Prisma.Decimal | null;
  fixedPrice: Prisma.Decimal | null;
  perPerson: boolean;
  dailyCap: Prisma.Decimal | null;
  gracePeriodMinutes: number;
} | null): PricingTypeConfig {
  if (!pt) {
    return {
      model: "HOURLY",
      hourlyRate: 0,
      fixedPrice: null,
      perPerson: true,
      dailyCap: null,
      gracePeriodMinutes: 15,
    };
  }
  return {
    model: pt.model,
    hourlyRate: toNumOrNull(pt.hourlyRate),
    fixedPrice: toNumOrNull(pt.fixedPrice),
    perPerson: pt.perPerson,
    dailyCap: toNumOrNull(pt.dailyCap),
    gracePeriodMinutes: pt.gracePeriodMinutes,
  };
}

const sessionInclude = {
  players: { orderBy: { createdAt: "asc" as const } },
  pricingType: true,
  package: true,
  member: true,
  orders: {
    where: { status: "SUBMITTED" as const },
    include: { items: { include: { modifiers: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

async function loadLiveSession(
  prisma: Prisma.TransactionClient,
  tableId: string,
) {
  return prisma.tableSession.findFirst({
    where: { tableId, status: { in: [...ACTIVE_SESSION_STATUSES] } },
    include: sessionInclude,
  });
}

export const sessionsRouter = router({
  listTables: staffProcedure.query(async ({ ctx }) => {
    const tables = await ctx.prisma.restaurantTable.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: {
        sessions: {
          where: { status: { in: [...ACTIVE_SESSION_STATUSES] } },
          include: {
            players: true,
            pricingType: true,
            member: { select: { id: true, adventurerName: true } },
            orders: {
              where: { status: "SUBMITTED" },
              include: { items: true },
            },
          },
          take: 1,
        },
      },
    });

    return tables.map((table) => {
      const session = table.sessions[0] ?? null;
      let liveTotal = 0;
      let activePlayers = 0;
      let mainTimer = null as null | {
        startTime: Date;
        pausedAt: Date | null;
        accumulatedPausedMs: number;
        endTime: Date | null;
        status: "ACTIVE" | "PAUSED" | "STOPPED";
      };
      if (session) {
        const fee = computeTableFee({
          pricingType: toPricingConfig(session.pricingType),
          players: session.players.map(toPlayerRecord),
        });
        const foodDrinkSubtotal = session.orders.reduce(
          (sum, order) =>
            sum +
            order.items.reduce(
              (s, item) => s + toNum(item.unitPriceSnapshot) * item.quantity,
              0,
            ),
          0,
        );
        liveTotal = fee.total + foodDrinkSubtotal;
        activePlayers = session.players.filter(
          (p) => p.status !== "STOPPED",
        ).length;
        // The "main table timer" the dashboard card shows is whichever
        // player has been running longest — representative of the whole
        // table since everyone starts together (§6).
        const sorted = [...session.players].sort(
          (a, b) => a.startTime.getTime() - b.startTime.getTime(),
        );
        const representative =
          sorted.find((p) => p.status !== "STOPPED") ?? sorted[0] ?? null;
        if (representative) {
          mainTimer = {
            startTime: representative.startTime,
            pausedAt: representative.pausedAt,
            accumulatedPausedMs: Number(representative.accumulatedPausedMs),
            endTime: representative.endTime,
            status: representative.status,
          };
        }
      }
      return {
        id: table.id,
        code: table.code,
        name: table.name,
        capacity: table.capacity,
        area: table.area,
        status: table.status,
        session: session
          ? {
              id: session.id,
              startTime: session.startTime,
              playerCount: session.playerCount,
              activePlayers,
              member: session.member,
              currentBill: liveTotal,
              mainTimer,
            }
          : null,
      };
    });
  }),

  getTableDetail: staffProcedure
    .input(z.object({ tableId: z.string() }))
    .query(async ({ ctx, input }) => {
      const table = await ctx.prisma.restaurantTable.findUnique({
        where: { id: input.tableId },
      });
      if (!table) throw new TRPCError({ code: "NOT_FOUND" });

      const session = await loadLiveSession(ctx.prisma, table.id);

      let liveBill = null;
      let foodDrinkSubtotal = 0;
      let grandTotal = 0;
      if (session) {
        liveBill = computeTableFee({
          pricingType: toPricingConfig(session.pricingType),
          players: session.players.map(toPlayerRecord),
        });
        foodDrinkSubtotal = session.orders.reduce(
          (sum, order) =>
            sum +
            order.items.reduce(
              (s, item) => s + toNum(item.unitPriceSnapshot) * item.quantity,
              0,
            ),
          0,
        );
        grandTotal = liveBill.total + foodDrinkSubtotal;
      }

      return { table, session, liveBill, foodDrinkSubtotal, grandTotal };
    }),

  openTable: permissionProcedure(Permission.MANAGE_TABLES)
    .input(
      z.object({
        tableId: z.string(),
        playerCount: z.number().int().min(1).max(50),
        pricingTypeId: z.string().optional(),
        packageId: z.string().optional(),
        memberId: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const table = await tx.restaurantTable.findUnique({
          where: { id: input.tableId },
        });
        if (!table || !table.active) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Table not found." });
        }
        if (!["AVAILABLE", "RESERVED"].includes(table.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Table ${table.code} is not available to open.`,
          });
        }

        let pricingTypeId = input.pricingTypeId;
        if (!pricingTypeId) {
          const regular = await tx.pricingType.findUnique({
            where: { code: "REGULAR" },
          });
          pricingTypeId = regular?.id;
        }

        const now = new Date();
        const session = await tx.tableSession.create({
          data: {
            tableId: table.id,
            status: "OPEN",
            startTime: now,
            playerCount: input.playerCount,
            pricingTypeId,
            packageId: input.packageId,
            memberId: input.memberId,
            notes: input.notes,
            createdById: ctx.staff.id,
            players: {
              create: Array.from({ length: input.playerCount }, (_, i) => ({
                label: `Player ${i + 1}`,
                startTime: now,
                status: "ACTIVE" as const,
                addedById: ctx.staff.id,
              })),
            },
          },
        });

        await tx.restaurantTable.update({
          where: { id: table.id },
          data: { status: "PLAYING" },
        });

        return { sessionId: session.id };
      });
    }),

  addPlayer: permissionProcedure(Permission.MANAGE_TIMERS)
    .input(z.object({ sessionId: z.string(), label: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.tableSession.findUnique({
        where: { id: input.sessionId },
      });
      if (!session || session.status === "CLOSED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session is not open." });
      }
      await ctx.prisma.$transaction([
        ctx.prisma.sessionPlayer.create({
          data: {
            sessionId: session.id,
            label: input.label ?? `Player ${session.playerCount + 1}`,
            startTime: new Date(),
            status: "ACTIVE",
            addedById: ctx.staff.id,
          },
        }),
        ctx.prisma.tableSession.update({
          where: { id: session.id },
          data: { playerCount: { increment: 1 } },
        }),
      ]);
      return { ok: true };
    }),

  pausePlayer: permissionProcedure(Permission.MANAGE_TIMERS)
    .input(z.object({ sessionPlayerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.prisma.sessionPlayer.findUnique({
        where: { id: input.sessionPlayerId },
      });
      if (!player || player.status !== "ACTIVE") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Player is not active." });
      }
      await ctx.prisma.sessionPlayer.update({
        where: { id: player.id },
        data: { status: "PAUSED", pausedAt: new Date() },
      });
      return { ok: true };
    }),

  resumePlayer: permissionProcedure(Permission.MANAGE_TIMERS)
    .input(z.object({ sessionPlayerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.prisma.sessionPlayer.findUnique({
        where: { id: input.sessionPlayerId },
      });
      if (!player || player.status !== "PAUSED" || !player.pausedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Player is not paused." });
      }
      const additionalPausedMs = Date.now() - player.pausedAt.getTime();
      await ctx.prisma.sessionPlayer.update({
        where: { id: player.id },
        data: {
          status: "ACTIVE",
          pausedAt: null,
          accumulatedPausedMs:
            player.accumulatedPausedMs + BigInt(Math.max(0, additionalPausedMs)),
        },
      });
      return { ok: true };
    }),

  stopPlayer: permissionProcedure(Permission.MANAGE_TIMERS)
    .input(z.object({ sessionPlayerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.prisma.sessionPlayer.findUnique({
        where: { id: input.sessionPlayerId },
      });
      if (!player || player.status === "STOPPED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Player already stopped." });
      }
      const now = new Date();
      const extraPausedMs =
        player.status === "PAUSED" && player.pausedAt
          ? Math.max(0, now.getTime() - player.pausedAt.getTime())
          : 0;
      await ctx.prisma.sessionPlayer.update({
        where: { id: player.id },
        data: {
          status: "STOPPED",
          pausedAt: null,
          endTime: now,
          accumulatedPausedMs: player.accumulatedPausedMs + BigInt(extraPausedMs),
        },
      });
      return { ok: true };
    }),

  restartPlayer: permissionProcedure(Permission.MANAGE_TIMERS)
    .input(z.object({ sessionPlayerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Un-stops a stopped player, resuming their clock without losing
      // previously accumulated billable/paused time (§6: "Restart Player if
      // permitted" — gated the same as other timer actions in V1).
      const player = await ctx.prisma.sessionPlayer.findUnique({
        where: { id: input.sessionPlayerId },
      });
      if (!player || player.status !== "STOPPED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Player is not stopped." });
      }
      await ctx.prisma.sessionPlayer.update({
        where: { id: player.id },
        data: { status: "ACTIVE", endTime: null },
      });
      return { ok: true };
    }),

  pauseTable: permissionProcedure(Permission.MANAGE_TIMERS)
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.tableSession.findUnique({
        where: { id: input.sessionId },
        include: { players: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const now = new Date();
      await ctx.prisma.$transaction([
        ...session.players
          .filter((p) => p.status === "ACTIVE")
          .map((p) =>
            ctx.prisma.sessionPlayer.update({
              where: { id: p.id },
              data: { status: "PAUSED", pausedAt: now },
            }),
          ),
        ctx.prisma.tableSession.update({
          where: { id: session.id },
          data: { status: "PAUSED" },
        }),
        ctx.prisma.restaurantTable.update({
          where: { id: session.tableId },
          data: { status: "PAUSED" },
        }),
      ]);
      return { ok: true };
    }),

  resumeTable: permissionProcedure(Permission.MANAGE_TIMERS)
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.tableSession.findUnique({
        where: { id: input.sessionId },
        include: { players: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const now = new Date();
      await ctx.prisma.$transaction([
        ...session.players
          .filter((p) => p.status === "PAUSED" && p.pausedAt)
          .map((p) =>
            ctx.prisma.sessionPlayer.update({
              where: { id: p.id },
              data: {
                status: "ACTIVE",
                pausedAt: null,
                accumulatedPausedMs:
                  p.accumulatedPausedMs +
                  BigInt(Math.max(0, now.getTime() - p.pausedAt!.getTime())),
              },
            }),
          ),
        ctx.prisma.tableSession.update({
          where: { id: session.id },
          data: { status: "OPEN" },
        }),
        ctx.prisma.restaurantTable.update({
          where: { id: session.tableId },
          data: { status: "PLAYING" },
        }),
      ]);
      return { ok: true };
    }),

  markReadyForCheckout: permissionProcedure(Permission.MANAGE_TIMERS)
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.tableSession.findUnique({
        where: { id: input.sessionId },
        include: { players: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const now = new Date();
      await ctx.prisma.$transaction([
        ...session.players
          .filter((p) => p.status !== "STOPPED")
          .map((p) => {
            const extraPausedMs =
              p.status === "PAUSED" && p.pausedAt
                ? Math.max(0, now.getTime() - p.pausedAt.getTime())
                : 0;
            return ctx.prisma.sessionPlayer.update({
              where: { id: p.id },
              data: {
                status: "STOPPED",
                pausedAt: null,
                endTime: now,
                accumulatedPausedMs: p.accumulatedPausedMs + BigInt(extraPausedMs),
              },
            });
          }),
        ctx.prisma.tableSession.update({
          where: { id: session.id },
          data: { status: "READY_FOR_CHECKOUT" },
        }),
        ctx.prisma.restaurantTable.update({
          where: { id: session.tableId },
          data: { status: "READY_TO_CHECKOUT" },
        }),
      ]);
      return { ok: true };
    }),

  linkMember: staffProcedure
    .input(z.object({ sessionId: z.string(), memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.tableSession.findUnique({
        where: { id: input.sessionId },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.memberId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A member is already linked — unlink first (§23: one member per table).",
        });
      }
      await ctx.prisma.tableSession.update({
        where: { id: session.id },
        data: { memberId: input.memberId },
      });
      return { ok: true };
    }),

  unlinkMember: staffProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.tableSession.update({
        where: { id: input.sessionId },
        data: { memberId: null },
      });
      return { ok: true };
    }),

  updateNotes: staffProcedure
    .input(z.object({ sessionId: z.string(), notes: z.string().max(2000) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.tableSession.update({
        where: { id: input.sessionId },
        data: { notes: input.notes },
      });
      return { ok: true };
    }),

  transferTable: permissionProcedure(Permission.MANAGE_TABLES)
    .input(z.object({ sessionId: z.string(), newTableId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [session, newTable] = await Promise.all([
        ctx.prisma.tableSession.findUnique({ where: { id: input.sessionId } }),
        ctx.prisma.restaurantTable.findUnique({ where: { id: input.newTableId } }),
      ]);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
      if (!newTable || !newTable.active || newTable.status !== "AVAILABLE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Target table is not available.",
        });
      }
      const oldTableId = session.tableId;
      const carryStatus =
        session.status === "PAUSED" ? "PAUSED" : ("PLAYING" as const);
      await ctx.prisma.$transaction([
        ctx.prisma.tableSession.update({
          where: { id: session.id },
          data: { tableId: newTable.id },
        }),
        ctx.prisma.restaurantTable.update({
          where: { id: newTable.id },
          data: { status: carryStatus },
        }),
        ctx.prisma.restaurantTable.update({
          where: { id: oldTableId },
          data: { status: "AVAILABLE" },
        }),
      ]);
      return { ok: true };
    }),
});

// Re-exported so callers building live-bill previews elsewhere (checkout,
// reports) share the exact same Decimal->number conversion.
export { toPricingConfig, toPlayerRecord, toNum };
