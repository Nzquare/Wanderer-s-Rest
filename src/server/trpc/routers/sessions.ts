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
import { computeProgression } from "@/server/domain/exp";
import { getSettings } from "@/server/settings/service";
import type { Prisma } from "@/generated/prisma/client";
import { logAudit } from "@/server/audit";
import { verifyStaffSecret } from "@/server/auth/password";
import { OPEN_ORDER_STATUSES } from "./orders";

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
    include: { items: { include: { modifiers: true, comboSelections: true } } },
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

/**
 * Shared shape for both the floor-plan grid (listTables) and the Quick
 * Sale list (listQuickSaleTables) — same session summary fields, just a
 * different `where` on kind so a Quick Sale table never doubles up on the
 * real floor plan.
 */
async function listTablesByKind(
  prisma: Prisma.TransactionClient,
  where: Prisma.RestaurantTableWhereInput,
) {
  const tables = await prisma.restaurantTable.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
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
    let tableFee = 0;
    let foodDrinkSubtotal = 0;
    let allDay = false;
    if (session) {
      const fee = computeTableFee({
        pricingType: toPricingConfig(session.pricingType),
        players: session.players.map(toPlayerRecord),
      });
      tableFee = fee.total;
      // Once every fee line has hit the daily cap the bill is pinned flat
      // for the rest of the day just like FIXED/PACKAGE pricing — show
      // "All day" instead of a duration that no longer means anything.
      allDay =
        session.pricingType?.model !== "HOURLY" ||
        (fee.lines.length > 0 && fee.lines.every((l) => l.cappedAtDailyCap));
      foodDrinkSubtotal = session.orders.reduce(
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
      kind: table.kind,
      originTableId: table.originTableId,
      session: session
        ? {
            id: session.id,
            startTime: session.startTime,
            playerCount: session.playerCount,
            activePlayers,
            member: session.member,
            currentBill: liveTotal,
            tableFee,
            // True for FIXED/PACKAGE pricing (never billed by elapsed
            // time) and for HOURLY pricing once every line has hit its
            // daily cap — either way the frontend shows "All day" instead
            // of a duration/per-player time breakdown that no longer
            // means anything.
            allDay,
            foodDrinkSubtotal,
            mainTimer,
          }
        : null,
    };
  });
}

export const sessionsRouter = router({
  listTables: staffProcedure.query(({ ctx }) =>
    listTablesByKind(ctx.prisma, { active: true, kind: "STANDARD" }),
  ),

  /**
   * The Quick Sale tab (§Quick Sale) — walk-in, delivery, and split-off
   * tables, kept off the physical floor-plan grid above. Closed ones
   * (checked out / voided) drop off automatically since they're not
   * `active` anymore — see checkout.recordPayment / sessions.voidSession,
   * which only ever mark the *physical* table CLEANING/AVAILABLE; Quick
   * Sale tables never route back into service, so checkout.recordPayment
   * and voidSession retire their row (CLOSED + inactive) instead — see
   * those for the branch on table.kind.
   */
  listQuickSaleTables: staffProcedure.query(({ ctx }) =>
    listTablesByKind(ctx.prisma, {
      active: true,
      kind: { in: ["WALK_IN", "DELIVERY", "SPLIT"] },
    }),
  ),

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
        // False = "seated, not playing yet" (§Start Playing) — customer is
        // ordering/deciding, no pricing type is chosen and no player timer
        // starts. Players land PAUSED at zero elapsed instead of ACTIVE,
        // same shape a genuine mid-game pause leaves them in, so resuming
        // later reuses that exact machinery. startPlaying below is the
        // only door back out of this state — see its own comment.
        startPlaying: z.boolean().default(true),
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
        // Same rule payment already enforces (checkout.recordPayment) — a
        // table's billable time and orders should always fall inside some
        // shift's accountability, not float outside every shift.
        const openShift = await tx.shift.findFirst({ where: { status: "OPEN" } });
        if (!openShift) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Open a shift before opening a table.",
          });
        }

        let pricingTypeId = input.pricingTypeId;
        if (input.startPlaying && !pricingTypeId) {
          const regular = await tx.pricingType.findUnique({
            where: { code: "REGULAR" },
          });
          pricingTypeId = regular?.id;
        }

        const now = new Date();
        const session = await tx.tableSession.create({
          data: {
            tableId: table.id,
            status: input.startPlaying ? "OPEN" : "PAUSED",
            startTime: now,
            playerCount: input.playerCount,
            // Left unset (null) in the "no play yet" case — that's the
            // signal startPlaying/resumePlayer check for "has this table
            // ever actually started" (see below).
            pricingTypeId: input.startPlaying ? pricingTypeId : undefined,
            packageId: input.packageId,
            memberId: input.memberId,
            notes: input.notes,
            createdById: ctx.staff.id,
            players: {
              create: Array.from({ length: input.playerCount }, (_, i) => ({
                label: `Player ${i + 1}`,
                startTime: now,
                pausedAt: input.startPlaying ? null : now,
                status: input.startPlaying ? ("ACTIVE" as const) : ("PAUSED" as const),
                addedById: ctx.staff.id,
              })),
            },
          },
        });

        await tx.restaurantTable.update({
          where: { id: table.id },
          data: { status: input.startPlaying ? "PLAYING" : "PAUSED" },
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
      if (!session || !["OPEN", "PAUSED"].includes(session.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            session?.status === "READY_FOR_CHECKOUT"
              ? "Table is locked for checkout — use Back to Table first."
              : "Session is not open.",
        });
      }
      // A player added while the table is PAUSED — whether that's a
      // genuine mid-game pause or the table hasn't started playing yet
      // (§Start Playing) — joins in that same paused state instead of
      // running while everyone else is stopped.
      const now = new Date();
      const paused = session.status === "PAUSED";
      await ctx.prisma.$transaction([
        ctx.prisma.sessionPlayer.create({
          data: {
            sessionId: session.id,
            label: input.label ?? `Player ${session.playerCount + 1}`,
            startTime: now,
            pausedAt: paused ? now : null,
            status: paused ? "PAUSED" : "ACTIVE",
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
        include: { session: { select: { pricingTypeId: true } } },
      });
      if (!player || player.status !== "PAUSED" || !player.pausedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Player is not paused." });
      }
      // No pricing type yet means this table hasn't started playing at all
      // (§Start Playing) — resuming one player one-off would start their
      // clock with no price chosen. Start Playing sets the price for the
      // whole table and resumes everyone together; a genuine mid-game
      // pause always already has a pricing type and isn't affected.
      if (!player.session.pricingTypeId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This table hasn't started playing yet — use Start Playing to pick a price first.",
        });
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
      // permitted" — gated the same as other timer actions in V1). The gap
      // between when they were stopped and now must NOT become billable —
      // folded into accumulatedPausedMs, same as backToTable below, so
      // restarting someone who's been sitting stopped for an hour doesn't
      // suddenly charge for that hour.
      const player = await ctx.prisma.sessionPlayer.findUnique({
        where: { id: input.sessionPlayerId },
      });
      if (!player || player.status !== "STOPPED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Player is not stopped." });
      }
      const now = new Date();
      const gapMs = player.endTime ? Math.max(0, now.getTime() - player.endTime.getTime()) : 0;
      await ctx.prisma.sessionPlayer.update({
        where: { id: player.id },
        data: {
          status: "ACTIVE",
          endTime: null,
          accumulatedPausedMs: player.accumulatedPausedMs + BigInt(gapMs),
        },
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
      // A table that never started playing (§Start Playing) is also
      // sitting PAUSED with no pricingTypeId — that state only unlocks
      // through startPlaying, which picks the price at the same time it
      // resumes everyone, never through a plain resume with no price set.
      if (session.status === "PAUSED" && !session.pricingTypeId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This table hasn't started playing yet — use Start Playing to pick a price first.",
        });
      }
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

  /**
   * Turns a "seated, not playing yet" table (opened with
   * openTable.startPlaying=false) into a running one: picks the pricing
   * type and resumes every player in one go, exactly like resumeTable
   * plus setting the price. Only valid from that pre-play state — a
   * table that's already started keeps whatever price it started with;
   * changing pricing mid-session isn't something a "resume" action
   * should ever do silently.
   */
  startPlaying: permissionProcedure(Permission.MANAGE_TIMERS)
    .input(z.object({ sessionId: z.string(), pricingTypeId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.tableSession.findUnique({
        where: { id: input.sessionId },
        include: { players: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.status !== "PAUSED" || session.pricingTypeId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This table has already started — use Resume Table instead.",
        });
      }
      const pricingType = await ctx.prisma.pricingType.findUnique({
        where: { id: input.pricingTypeId },
      });
      if (!pricingType || !pricingType.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Select a valid pricing type." });
      }
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
          data: { status: "OPEN", pricingTypeId: input.pricingTypeId },
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

  /**
   * Undo markReadyForCheckout — the customer wants to keep playing or
   * order more after being sent to checkout. Resumes every player that
   * got auto-stopped by Send to Checkout (§6) and reopens the table for
   * orders/timers again. The gap between being stopped and resumed here
   * doesn't count as billable time — same accumulatedPausedMs pattern
   * used for an explicit pause, just computed from the auto-stop instead.
   *
   * Simplification: this resumes *every* currently-STOPPED player, not
   * only the ones Send to Checkout itself stopped — in the common case
   * that's the same set, since Send to Checkout stops everyone still
   * running at once. A player who was individually stopped earlier for
   * an unrelated reason (e.g. left early) would also resume; staff can
   * stop them again if that's not wanted.
   */
  backToTable: permissionProcedure(Permission.MANAGE_TIMERS)
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.tableSession.findUnique({
        where: { id: input.sessionId },
        include: { players: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.status !== "READY_FOR_CHECKOUT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This table isn't waiting for checkout.",
        });
      }
      const now = new Date();
      await ctx.prisma.$transaction([
        ...session.players
          .filter((p) => p.status === "STOPPED")
          .map((p) => {
            const gapMs = p.endTime ? Math.max(0, now.getTime() - p.endTime.getTime()) : 0;
            return ctx.prisma.sessionPlayer.update({
              where: { id: p.id },
              data: {
                status: "ACTIVE",
                pausedAt: null,
                endTime: null,
                accumulatedPausedMs: p.accumulatedPausedMs + BigInt(gapMs),
              },
            });
          }),
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

  /**
   * Cancel/void an active table before it's paid (§22) — customer walked
   * out, wrong table opened, etc. Requires a reason and which staff member
   * the action is assigned to (the one accountable for it — e.g. an
   * approving manager, not necessarily whoever is physically at the
   * keyboard); who did it and when is always recorded (session.closedById/
   * updatedAt + an audit entry), and the session row is kept forever, just
   * marked VOIDED — nothing about a table is ever deleted. Never has EXP
   * to reverse: it only ever runs before payment, and EXP is awarded at
   * payment time (recordPayment in checkout.ts) — a voided session never
   * got that far.
   */
  voidSession: permissionProcedure(Permission.VOID_TRANSACTION)
    .input(
      z.object({
        sessionId: z.string(),
        staffId: z.string(),
        pin: z.string().min(1),
        reason: z.string().min(1).max(300),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const session = await tx.tableSession.findUnique({
          where: { id: input.sessionId },
          include: { players: true, table: true },
        });
        if (!session) throw new TRPCError({ code: "NOT_FOUND" });
        if (session.status === "CLOSED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Table is already closed." });
        }
        const assignedStaff = await tx.staff.findUnique({ where: { id: input.staffId } });
        if (!assignedStaff || assignedStaff.status !== "ACTIVE") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Select a valid active staff member." });
        }
        // Picking a name from the "assign to" dropdown doesn't prove that
        // person authorized it — require their own PIN/password, same
        // check the login form uses, before the void goes through.
        if (!(await verifyStaffSecret(assignedStaff, input.pin))) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Incorrect passcode for the assigned staff member.",
          });
        }

        // Voiding cancels the table with no charge — any reward the member
        // "spent" via an applied promotion (§Benefits) was never actually
        // redeemed, so give it back rather than leaving it stuck USED with
        // nothing to show for it. Unlike refundSession's post-payment
        // reversal (deliberately hands-off on benefits — the bill really
        // was paid), a voided bill never happened at all.
        const redeemedHere = await tx.appliedDiscount.findMany({
          where: { sessionId: session.id, benefitRedemptionId: { not: null } },
          select: { benefitRedemptionId: true },
        });
        if (redeemedHere.length > 0) {
          await tx.benefitRedemption.updateMany({
            where: { id: { in: redeemedHere.map((d) => d.benefitRedemptionId!) } },
            data: { status: "AVAILABLE", usedAt: null, usedById: null, relatedSessionId: null },
          });
        }

        const now = new Date();
        for (const p of session.players) {
          if (p.status === "STOPPED") continue;
          const extraPausedMs =
            p.status === "PAUSED" && p.pausedAt
              ? Math.max(0, now.getTime() - p.pausedAt.getTime())
              : 0;
          await tx.sessionPlayer.update({
            where: { id: p.id },
            data: {
              status: "STOPPED",
              pausedAt: null,
              endTime: now,
              accumulatedPausedMs: p.accumulatedPausedMs + BigInt(extraPausedMs),
            },
          });
        }

        await tx.tableSession.update({
          where: { id: session.id },
          data: {
            status: "CLOSED",
            paymentStatus: "VOIDED",
            endTime: now,
            closedById: assignedStaff.id,
            notes: session.notes
              ? `${session.notes}\n[VOIDED by ${assignedStaff.name}: ${input.reason}]`
              : `[VOIDED by ${assignedStaff.name}: ${input.reason}]`,
          },
        });
        // Same physical-vs-Quick-Sale split as checkout.recordPayment: a
        // real table needs cleaning before reuse, a Quick Sale table just
        // retires (§Quick Sale).
        await tx.restaurantTable.update({
          where: { id: session.tableId },
          data:
            session.table.kind === "STANDARD"
              ? { status: "CLEANING" }
              : { status: "CLOSED", active: false },
        });

        await logAudit(tx, {
          staffId: assignedStaff.id,
          action: "VOID_TRANSACTION",
          entityType: "TableSession",
          entityId: session.id,
          previousValue: { status: session.status, table: session.table.code },
          newValue: { status: "CLOSED", paymentStatus: "VOIDED" },
          reason: input.reason,
        });

        return { ok: true };
      });
    }),

  /**
   * Refund/void an *already checked-out* bill (§22/§43) — distinct from
   * voidSession above, which only works before payment. This is the
   * post-payment reversal: gated on REFUND_TRANSACTION (a separate,
   * usually more restricted permission than VOID_TRANSACTION — see
   * DEFAULT_ROLE_PERMISSIONS), requires a reason and which staff member
   * the action is assigned to (the accountable party, picked explicitly
   * rather than assumed to be whoever is clicking).
   *
   * Also reverses whatever this bill actually granted the member: EXP,
   * lifetime spending, and rank all get walked back by the exact amounts
   * this session's own snapshot recorded (session.expAwarded and the
   * subtotal/discount fields — never recomputed from *current* settings,
   * per §45) via an offsetting ExpHistory row rather than deleting the
   * original PURCHASE entry. Achievements already unlocked from this bill
   * are deliberately left alone — revoking a milestone (and any benefit
   * already redeemed from it) isn't something a refund should do
   * silently; that stays a separate manual call if it's ever needed.
   */
  refundSession: permissionProcedure(Permission.REFUND_TRANSACTION)
    .input(
      z.object({
        sessionId: z.string(),
        staffId: z.string(),
        pin: z.string().min(1),
        reason: z.string().min(1).max(300),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const session = await tx.tableSession.findUnique({
          where: { id: input.sessionId },
          include: { table: { select: { code: true } }, member: true },
        });
        if (!session) throw new TRPCError({ code: "NOT_FOUND" });
        if (session.status !== "CLOSED" || session.paymentStatus !== "PAID") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Only a paid, checked-out bill can be refunded this way — an open table uses Void instead.",
          });
        }
        const assignedStaff = await tx.staff.findUnique({ where: { id: input.staffId } });
        if (!assignedStaff || assignedStaff.status !== "ACTIVE") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Select a valid active staff member." });
        }
        // Picking a name from the "assign to" dropdown doesn't prove that
        // person authorized it — require their own PIN/password, same
        // check the login form uses, before the refund goes through.
        if (!(await verifyStaffSecret(assignedStaff, input.pin))) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Incorrect passcode for the assigned staff member.",
          });
        }

        let expReversed = 0;
        if (session.member && session.expAwarded > 0) {
          const member = session.member;
          const eligibleSpendAtPayment = Math.max(
            0,
            toNum(session.subtotalTableFee) +
              toNum(session.subtotalFoodDrink) -
              toNum(session.discountTotal),
          );
          const newLifetimeExp = Math.max(0, member.lifetimeExp - session.expAwarded);
          const newLifetimeSpending = Math.max(
            0,
            toNum(member.lifetimeSpending) - eligibleSpendAtPayment,
          );

          const [ranks, membershipSettings] = await Promise.all([
            tx.rank.findMany({ orderBy: { order: "asc" } }),
            getSettings("membership", tx),
          ]);
          const after = computeProgression(newLifetimeExp, membershipSettings.expPerLevel, ranks);

          await tx.member.update({
            where: { id: member.id },
            data: {
              lifetimeExp: newLifetimeExp,
              lifetimeSpending: newLifetimeSpending,
              rankId: after.rank.id,
            },
          });
          await tx.expHistory.create({
            data: {
              memberId: member.id,
              sessionId: session.id,
              amount: -session.expAwarded,
              reason: "REFUND",
              staffId: assignedStaff.id,
              lifetimeExpAfter: newLifetimeExp,
              note: input.reason,
            },
          });
          expReversed = session.expAwarded;
        }

        await tx.tableSession.update({
          where: { id: session.id },
          data: {
            paymentStatus: "REFUNDED",
            notes: session.notes
              ? `${session.notes}\n[REFUNDED by ${assignedStaff.name}: ${input.reason}]`
              : `[REFUNDED by ${assignedStaff.name}: ${input.reason}]`,
          },
        });

        await logAudit(tx, {
          staffId: assignedStaff.id,
          action: "REFUND_TRANSACTION",
          entityType: "TableSession",
          entityId: session.id,
          previousValue: { paymentStatus: "PAID", table: session.table.code },
          newValue: { paymentStatus: "REFUNDED", expReversed },
          reason: input.reason,
        });

        return { ok: true, expReversed };
      });
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

  /**
   * "Split bill" from a real table's page (§Quick Sale) — a group at one
   * table wants separate checks. Spins off a brand-new SPLIT Quick Sale
   * table + session and moves the chosen players and/or order-item
   * quantities onto it; everything left behind stays on the original
   * table exactly as it was. The two bills are then completely
   * independent — separate timers (a moved player's clock keeps running
   * unbroken, just billed to the new table from here on), separate
   * orders, separate checkout.
   *
   * Splitting only an item's *quantity* (not the whole line) decrements
   * the original OrderItem and creates a fresh one on a new Order under
   * the split session, copying its modifier/combo-selection snapshots —
   * the original keeps its own copy so both halves' receipts stay
   * accurate on their own (§45).
   */
  splitOff: permissionProcedure(Permission.MANAGE_TABLES)
    .input(
      z
        .object({
          sourceSessionId: z.string(),
          source: z.enum(["CASHIER", "STAFF"]),
          playerIds: z.array(z.string()).default([]),
          itemMoves: z
            .array(z.object({ orderItemId: z.string(), quantity: z.number().int().min(1) }))
            .default([]),
          notes: z.string().max(500).optional(),
        })
        .refine((v) => v.playerIds.length > 0 || v.itemMoves.length > 0, {
          message: "Pick at least one player or item to move to the split.",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const session = await tx.tableSession.findUnique({
          where: { id: input.sourceSessionId },
          include: {
            table: true,
            players: true,
            orders: {
              where: { status: "SUBMITTED" },
              include: { items: { include: { modifiers: true, comboSelections: true } } },
            },
          },
        });
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Table not found." });
        if (!OPEN_ORDER_STATUSES.includes(session.status as (typeof OPEN_ORDER_STATUSES)[number])) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Table isn't open — back to table first before splitting the bill.",
          });
        }
        const openShift = await tx.shift.findFirst({ where: { status: "OPEN" } });
        if (!openShift) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Open a shift before splitting a bill.",
          });
        }

        const playerSet = new Set(input.playerIds);
        const movedPlayers = session.players.filter((p) => playerSet.has(p.id));
        if (movedPlayers.length !== input.playerIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One of the selected players isn't on this table.",
          });
        }

        const itemsById = new Map(
          session.orders.flatMap((o) => o.items.map((i) => [i.id, i] as const)),
        );
        for (const move of input.itemMoves) {
          const item = itemsById.get(move.orderItemId);
          if (!item) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "One of the selected items isn't on this table's open orders.",
            });
          }
          if (move.quantity > item.quantity) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Can't move ${move.quantity}× ${item.nameSnapshotEn} — only ${item.quantity} on the bill.`,
            });
          }
        }

        const splitCount = await tx.restaurantTable.count({
          where: { originTableId: session.table.id },
        });
        const newTable = await tx.restaurantTable.create({
          data: {
            code: `${session.table.code}-S${splitCount + 1}`,
            name: `${session.table.name} (split)`,
            capacity: Math.max(1, movedPlayers.length),
            kind: "SPLIT",
            originTableId: session.table.id,
            qrEnabled: false,
            status: "PLAYING",
          },
        });

        const newSession = await tx.tableSession.create({
          data: {
            tableId: newTable.id,
            status: "OPEN",
            startTime: new Date(),
            playerCount: movedPlayers.length,
            pricingTypeId: session.pricingTypeId,
            packageId: session.packageId,
            notes: input.notes ?? `Split from ${session.table.code}`,
            createdById: ctx.staff.id,
          },
        });

        if (movedPlayers.length > 0) {
          await tx.sessionPlayer.updateMany({
            where: { id: { in: movedPlayers.map((p) => p.id) } },
            data: { sessionId: newSession.id },
          });
          await tx.tableSession.update({
            where: { id: session.id },
            data: { playerCount: { decrement: movedPlayers.length } },
          });
        }

        if (input.itemMoves.length > 0) {
          const newOrder = await tx.order.create({
            data: {
              sessionId: newSession.id,
              source: input.source,
              orderedById: ctx.staff.id,
              notes: `Split from ${session.table.code}`,
            },
          });
          for (const move of input.itemMoves) {
            const item = itemsById.get(move.orderItemId)!;
            await tx.orderItem.create({
              data: {
                orderId: newOrder.id,
                menuItemId: item.menuItemId,
                nameSnapshotTh: item.nameSnapshotTh,
                nameSnapshotEn: item.nameSnapshotEn,
                quantity: move.quantity,
                unitPriceSnapshot: item.unitPriceSnapshot,
                notes: item.notes,
                modifiers: {
                  create: item.modifiers.map((m) => ({
                    modifierOptionId: m.modifierOptionId,
                    nameSnapshotTh: m.nameSnapshotTh,
                    nameSnapshotEn: m.nameSnapshotEn,
                    priceSnapshot: m.priceSnapshot,
                  })),
                },
                comboSelections: {
                  create: item.comboSelections.map((cs) => ({
                    comboSlotId: cs.comboSlotId,
                    slotNameSnapshotTh: cs.slotNameSnapshotTh,
                    slotNameSnapshotEn: cs.slotNameSnapshotEn,
                    selectedMenuItemId: cs.selectedMenuItemId,
                    nameSnapshotTh: cs.nameSnapshotTh,
                    nameSnapshotEn: cs.nameSnapshotEn,
                    extraChargeSnapshot: cs.extraChargeSnapshot,
                  })),
                },
              },
            });
            if (move.quantity === item.quantity) {
              await tx.orderItem.delete({ where: { id: item.id } });
            } else {
              await tx.orderItem.update({
                where: { id: item.id },
                data: { quantity: { decrement: move.quantity } },
              });
            }
          }
        }

        return { sessionId: newSession.id, tableId: newTable.id };
      });
    }),
});

// Re-exported so callers building live-bill previews elsewhere (checkout,
// reports) share the exact same Decimal->number conversion.
export { toPricingConfig, toPlayerRecord, toNum };
