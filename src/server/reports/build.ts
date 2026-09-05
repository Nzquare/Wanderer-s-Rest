/**
 * Report query logic (§43), factored out of the tRPC router so the Excel
 * export route handler (which isn't a tRPC procedure — it needs to stream
 * back a binary file, not JSON) can build the exact same numbers without
 * duplicating the queries. Both call sites just need a Prisma client and a
 * date range.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { toNum } from "@/lib/decimal";

export interface DateRange {
  from: Date;
  to: Date;
}

/** Parses the report screen's `?from=&to=` (or Excel export's) inputs into a proper range. */
export function parseDateRange(fromISO: string, toISO: string): DateRange {
  return {
    from: new Date(fromISO),
    to: new Date(new Date(toISO).setHours(23, 59, 59, 999)),
  };
}

export async function buildSummaryReport(prisma: PrismaClient, range: DateRange) {
  const { from, to } = range;
  const closedInRange = { status: "CLOSED" as const, endTime: { gte: from, lte: to } };

  const [sessions, payments, discounts, memberSessions, totalMembers, activeMembers, newMembers] =
    await Promise.all([
      prisma.tableSession.findMany({
        where: closedInRange,
        select: {
          subtotalTableFee: true,
          subtotalFoodDrink: true,
          totalAmount: true,
          discountTotal: true,
          paymentStatus: true,
          memberId: true,
          startTime: true,
          endTime: true,
        },
      }),
      prisma.payment.findMany({
        where: { createdAt: { gte: from, lte: to }, status: "COMPLETED" },
        select: { method: true, amount: true },
      }),
      prisma.appliedDiscount.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { amount: true, label: true, promotion: { select: { type: true } } },
      }),
      prisma.tableSession.findMany({
        where: { ...closedInRange, memberId: { not: null } },
        select: { totalAmount: true },
      }),
      prisma.member.count(),
      prisma.member.count({ where: { status: "ACTIVE" } }),
      prisma.member.count({ where: { joinDate: { gte: from, lte: to } } }),
    ]);

  const paidSessions = sessions.filter((s) => s.paymentStatus === "PAID");
  const voidedSessions = sessions.filter((s) => s.paymentStatus === "VOIDED");
  const refundedSessions = sessions.filter((s) => s.paymentStatus === "REFUNDED");

  const totalRevenue = paidSessions.reduce((s, x) => s + toNum(x.totalAmount), 0);
  const tableFeeRevenue = paidSessions.reduce((s, x) => s + toNum(x.subtotalTableFee), 0);
  const foodDrinkRevenue = paidSessions.reduce((s, x) => s + toNum(x.subtotalFoodDrink), 0);
  const memberRevenue = memberSessions.reduce((s, x) => s + toNum(x.totalAmount), 0);
  const avgBill = paidSessions.length ? totalRevenue / paidSessions.length : 0;

  const byMethod: Record<string, number> = { CASH: 0, PROMPTPAY: 0, CARD: 0, OTHER: 0 };
  for (const p of payments) byMethod[p.method] += toNum(p.amount);

  const totalTableMinutes = paidSessions.reduce((s, x) => {
    if (!x.endTime) return s;
    return s + (x.endTime.getTime() - x.startTime.getTime()) / 60_000;
  }, 0);
  const avgSessionMinutes = paidSessions.length ? totalTableMinutes / paidSessions.length : 0;

  const [topItems, topGames, topAchievements] = await Promise.all([
    prisma.orderItem.groupBy({
      by: ["nameSnapshotEn"],
      where: { order: { createdAt: { gte: from, lte: to } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    prisma.gameSession.groupBy({
      by: ["gameId"],
      where: { playedAt: { gte: from, lte: to } },
      _count: { _all: true },
      orderBy: { _count: { gameId: "desc" } },
      take: 5,
    }),
    prisma.memberAchievement.groupBy({
      by: ["achievementId"],
      where: { unlockedAt: { gte: from, lte: to } },
      _count: { _all: true },
      orderBy: { _count: { achievementId: "desc" } },
      take: 5,
    }),
  ]);

  // A play of a since-deleted game (§Delete a game) groups under
  // gameId: null — never a real Game id, so it's filtered out here and
  // just falls back to "Unknown" below via the games.find() miss.
  const gameIds = topGames.map((g) => g.gameId).filter((id): id is string => id != null);
  const games = gameIds.length
    ? await prisma.game.findMany({ where: { id: { in: gameIds } } })
    : [];
  const achievementIds = topAchievements.map((a) => a.achievementId);
  const achievements = achievementIds.length
    ? await prisma.achievement.findMany({ where: { id: { in: achievementIds } } })
    : [];

  return {
    sales: {
      totalRevenue,
      tableFeeRevenue,
      foodDrinkRevenue,
      memberRevenue,
      nonMemberRevenue: totalRevenue - memberRevenue,
      avgBill,
      paidSessionCount: paidSessions.length,
    },
    payments: byMethod,
    discounts: {
      count: discounts.length,
      // EXP_BONUS's amount is a raw EXP number, not money (§Award EXP as
      // promotion) — excluded here for the same reason
      // buildPromotionUsageReport keeps it out of totalDiscount.
      total: discounts
        .filter((d) => d.promotion?.type !== "EXP_BONUS")
        .reduce((s, d) => s + toNum(d.amount), 0),
    },
    table: {
      totalSessions: paidSessions.length,
      totalTableHours: totalTableMinutes / 60,
      avgSessionMinutes,
    },
    voidRefund: {
      voidedCount: voidedSessions.length,
      refundedCount: refundedSessions.length,
    },
    membership: {
      totalMembers,
      activeMembers,
      newMembers,
      memberRevenue,
    },
    topItems: topItems.map((i) => ({ name: i.nameSnapshotEn, quantity: i._sum.quantity ?? 0 })),
    topGames: topGames.map((g) => ({
      name: games.find((x) => x.id === g.gameId)?.nameEn ?? "Unknown",
      plays: g._count._all,
    })),
    topAchievements: topAchievements.map((a) => ({
      name: achievements.find((x) => x.id === a.achievementId)?.nameEn ?? "Unknown",
      count: a._count._all,
    })),
  };
}

export type SummaryReport = Awaited<ReturnType<typeof buildSummaryReport>>;

/**
 * Detail report (§43) — one row per checked-out bill in range, rather than
 * the summary's aggregates. This is also where a Void/Refund action can
 * target a specific bill (see sessions.refundSession).
 */
export async function buildTransactionsReport(prisma: PrismaClient, range: DateRange) {
  const { from, to } = range;
  const sessions = await prisma.tableSession.findMany({
    where: { status: "CLOSED", endTime: { gte: from, lte: to } },
    include: {
      table: { select: { code: true, name: true } },
      member: { select: { adventurerName: true } },
      // Who *closed out* the sale — for a VOIDED session this happens to
      // be the same staff who voided it (voidSession sets closedById to
      // whoever it's assigned to), but for a REFUNDED one it's still
      // whoever originally checked the bill out, not whoever refunded it
      // later. voidedOrRefundedBy/Reason below is the one that actually
      // answers "who did the void/refund, and why" (§Transactions:
      // record void/refund by who and why) — this stays as the separate
      // "who closed this sale" fact it always was.
      closedBy: { select: { name: true } },
      payments: { where: { status: "COMPLETED" }, select: { method: true, amount: true } },
      receipt: { select: { receiptNumber: true } },
    },
    orderBy: { endTime: "desc" },
  });

  // One batched AuditLog lookup for every voided/refunded session in this
  // page, instead of a query per row — same source buildVoidRefundReport
  // already reads (staffId + reason are recorded there at the moment of
  // the action, in sessions.ts's voidSession/refundSession), just merged
  // directly onto each transaction row here instead of living only in
  // that separate report.
  const reversedSessionIds = sessions
    .filter((s) => s.paymentStatus === "VOIDED" || s.paymentStatus === "REFUNDED")
    .map((s) => s.id);
  const reversalLogs = reversedSessionIds.length
    ? await prisma.auditLog.findMany({
        where: {
          entityType: "TableSession",
          entityId: { in: reversedSessionIds },
          action: { in: ["VOID_TRANSACTION", "REFUND_TRANSACTION"] },
        },
        include: { staff: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  // Latest entry per session (findMany above is already newest-first) —
  // in the ordinary case there's exactly one, but this stays correct if
  // a session were somehow voided/refunded more than once.
  const reversalBySession = new Map<string, (typeof reversalLogs)[number]>();
  for (const log of reversalLogs) {
    if (log.entityId && !reversalBySession.has(log.entityId)) {
      reversalBySession.set(log.entityId, log);
    }
  }

  return sessions.map((s) => {
    const reversal = reversalBySession.get(s.id);
    return {
      id: s.id,
      receiptNumber: s.receipt?.receiptNumber ?? null,
      endTime: s.endTime,
      tableCode: s.table.code,
      tableName: s.table.name,
      memberName: s.member?.adventurerName ?? null,
      staffName: s.closedBy?.name ?? null,
      subtotalTableFee: toNum(s.subtotalTableFee),
      subtotalFoodDrink: toNum(s.subtotalFoodDrink),
      discountTotal: toNum(s.discountTotal),
      taxAmount: toNum(s.taxAmount),
      serviceChargeAmount: toNum(s.serviceChargeAmount),
      totalAmount: toNum(s.totalAmount),
      paymentStatus: s.paymentStatus,
      paymentMethods: s.payments.map((p) => p.method).join(", "),
      expAwarded: s.expAwarded,
      voidedOrRefundedBy: reversal?.staff?.name ?? null,
      voidedOrRefundedReason: reversal?.reason ?? null,
    };
  });
}

export type TransactionsReport = Awaited<ReturnType<typeof buildTransactionsReport>>;

/**
 * Sales by Category — every menu category's items ordered in range, not
 * just the Overview's top-5 items. Revenue is quantity × the *snapshotted*
 * unit price on each order item (§45: never recomputed from the live menu
 * item price), summed per category. groupBy can't do a computed
 * quantity×price sum in Prisma, so this pulls the raw rows and reduces in
 * JS — fine at café-scale order volumes.
 *
 * Only counts items from a session that actually got paid — matches
 * buildSummaryReport's paidSessions convention — so a voided or refunded
 * sale's items don't inflate category revenue/quantity even though the
 * OrderItem rows themselves are never deleted (§45 historical data).
 */
export async function buildSalesByCategoryReport(prisma: PrismaClient, range: DateRange) {
  const { from, to } = range;
  const items = await prisma.orderItem.findMany({
    where: { order: { createdAt: { gte: from, lte: to }, session: { paymentStatus: "PAID" } } },
    select: {
      quantity: true,
      unitPriceSnapshot: true,
      menuItem: { select: { category: { select: { id: true, nameEn: true } } } },
    },
  });

  const byCategory = new Map<string, { categoryName: string; quantity: number; revenue: number }>();
  for (const item of items) {
    // A hard-deleted menu item (§Delete anyway) has no live category
    // anymore — its historical orders bucket under "Other" rather than
    // being dropped from the report.
    const catId = item.menuItem?.category.id ?? "__deleted__";
    const existing = byCategory.get(catId) ?? {
      categoryName: item.menuItem?.category.nameEn ?? "Other",
      quantity: 0,
      revenue: 0,
    };
    existing.quantity += item.quantity;
    existing.revenue += toNum(item.unitPriceSnapshot) * item.quantity;
    byCategory.set(catId, existing);
  }

  return Array.from(byCategory.entries())
    .map(([categoryId, v]) => ({ categoryId, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

export type SalesByCategoryReport = Awaited<ReturnType<typeof buildSalesByCategoryReport>>;

/**
 * Sales by Product — every menu item ordered in range (full list, not the
 * Overview's top 5), using the same snapshotted-name/price approach as
 * buildSalesByCategoryReport above, including the same paid-sessions-only
 * filter so voided/refunded sales don't count here either.
 */
export async function buildSalesByProductReport(prisma: PrismaClient, range: DateRange) {
  const { from, to } = range;
  const items = await prisma.orderItem.findMany({
    where: { order: { createdAt: { gte: from, lte: to }, session: { paymentStatus: "PAID" } } },
    select: {
      menuItemId: true,
      nameSnapshotEn: true,
      quantity: true,
      unitPriceSnapshot: true,
      menuItem: { select: { category: { select: { nameEn: true } } } },
    },
  });

  const byItem = new Map<
    string,
    { menuItemId: string | null; name: string; categoryName: string; quantity: number; revenue: number }
  >();
  for (const item of items) {
    // A deleted item has menuItemId: null forever after (§Delete anyway),
    // so group by name instead in that case — otherwise every deleted
    // item's history would collapse into one row under a null key.
    const key = item.menuItemId ?? `deleted:${item.nameSnapshotEn}`;
    const existing = byItem.get(key) ?? {
      menuItemId: item.menuItemId,
      name: item.nameSnapshotEn,
      categoryName: item.menuItem?.category.nameEn ?? "Other",
      quantity: 0,
      revenue: 0,
    };
    existing.quantity += item.quantity;
    existing.revenue += toNum(item.unitPriceSnapshot) * item.quantity;
    byItem.set(key, existing);
  }

  return Array.from(byItem.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

export type SalesByProductReport = Awaited<ReturnType<typeof buildSalesByProductReport>>;

/** Games Played — every game recorded in range (full list, not the Overview's top 5). */
export async function buildGamesPlayedReport(prisma: PrismaClient, range: DateRange) {
  const { from, to } = range;
  const grouped = await prisma.gameSession.groupBy({
    by: ["gameId"],
    where: { playedAt: { gte: from, lte: to } },
    _count: { _all: true },
    orderBy: { _count: { gameId: "desc" } },
  });

  // Same null-filtering as the Overview's topGames above — a deleted
  // game's plays group under gameId: null.
  const gameIds = grouped.map((g) => g.gameId).filter((id): id is string => id != null);
  const games = gameIds.length
    ? await prisma.game.findMany({
        where: { id: { in: gameIds } },
        include: { category: { select: { nameEn: true } } },
      })
    : [];

  return grouped.map((g, i) => {
    const game = g.gameId ? games.find((x) => x.id === g.gameId) : undefined;
    return {
      // gameId is null for deleted games, and every deleted game's plays
      // land in the *same* null-keyed group — `id` gives the row a
      // unique React key regardless (index is fine here since this list
      // is regenerated fresh per query, never reordered in place).
      id: g.gameId ?? `deleted-${i}`,
      gameId: g.gameId,
      name: game?.nameEn ?? "Unknown",
      categoryName: game?.category?.nameEn ?? "—",
      plays: g._count._all,
    };
  });
}

export type GamesPlayedReport = Awaited<ReturnType<typeof buildGamesPlayedReport>>;

/**
 * Promotion usage — how many times each promotion was applied in range and
 * how much it discounted in total. Manual/custom discounts (not tied to a
 * Promotion row — see checkout.applyManualDiscount) are grouped together
 * under a single "Manual / custom discount" row rather than dropped.
 */
export async function buildPromotionUsageReport(prisma: PrismaClient, range: DateRange) {
  const { from, to } = range;
  const discounts = await prisma.appliedDiscount.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { promotionId: true, amount: true, promotion: { select: { name: true, type: true } } },
  });

  const MANUAL_KEY = "__manual__";
  const byPromo = new Map<
    string,
    { name: string; usageCount: number; totalDiscount: number; totalExpAwarded: number }
  >();
  for (const d of discounts) {
    const key = d.promotionId ?? MANUAL_KEY;
    const existing = byPromo.get(key) ?? {
      name: d.promotion?.name ?? "Manual / custom discount",
      usageCount: 0,
      totalDiscount: 0,
      totalExpAwarded: 0,
    };
    existing.usageCount += 1;
    // EXP_BONUS's amount is a raw EXP number, not money (§Award EXP as
    // promotion) — summing it into totalDiscount alongside real ฿
    // amounts would be meaningless, so it gets its own running total
    // instead. A given promotion is always exactly one type, so a row
    // never needs both totals populated at once.
    if (d.promotion?.type === "EXP_BONUS") {
      existing.totalExpAwarded += Math.round(toNum(d.amount));
    } else {
      existing.totalDiscount += toNum(d.amount);
    }
    byPromo.set(key, existing);
  }

  return Array.from(byPromo.entries())
    .map(([key, v]) => ({ promotionId: key === MANUAL_KEY ? null : key, ...v }))
    .sort((a, b) => b.totalDiscount - a.totalDiscount);
}

export type PromotionUsageReport = Awaited<ReturnType<typeof buildPromotionUsageReport>>;

/**
 * Shift / Cash Reconciliation — expected vs actual cash counted per shift,
 * an accounting-control view that's otherwise only visible one shift at a
 * time on the Shift page. Filtered by openedAt, since that's what "this
 * shift belongs to the selected period" means.
 */
export async function buildShiftReconciliationReport(prisma: PrismaClient, range: DateRange) {
  const { from, to } = range;
  const shifts = await prisma.shift.findMany({
    where: { openedAt: { gte: from, lte: to } },
    include: {
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
    },
    orderBy: { openedAt: "desc" },
  });

  return shifts.map((s) => ({
    id: s.id,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    openedByName: s.openedBy.name,
    closedByName: s.closedBy?.name ?? null,
    status: s.status,
    startingCash: toNum(s.startingCash),
    expectedCash: s.expectedCash != null ? toNum(s.expectedCash) : null,
    actualCashCounted: s.actualCashCounted != null ? toNum(s.actualCashCounted) : null,
    cashDifference: s.cashDifference != null ? toNum(s.cashDifference) : null,
  }));
}

export type ShiftReconciliationReport = Awaited<ReturnType<typeof buildShiftReconciliationReport>>;

/**
 * Void & Refund Detail — every void/refund in range, one row each, pulled
 * from the AuditLog (the only place that records precisely *when* the
 * action happened — a refunded session's own timestamps still reflect the
 * original checkout, not the refund). A void never charged anything (it
 * only ever runs before payment — see sessions.voidSession's doc comment),
 * so its amount is reported as null rather than a fabricated number; a
 * refund's amount is the session's own recorded totalAmount from payment
 * time (§45: never recomputed).
 */
export async function buildVoidRefundReport(prisma: PrismaClient, range: DateRange) {
  const { from, to } = range;
  const entries = await prisma.auditLog.findMany({
    where: {
      action: { in: ["VOID_TRANSACTION", "REFUND_TRANSACTION"] },
      createdAt: { gte: from, lte: to },
    },
    include: { staff: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const sessionIds = entries
    .map((e) => e.entityId)
    .filter((id): id is string => !!id);
  const sessions = sessionIds.length
    ? await prisma.tableSession.findMany({
        where: { id: { in: sessionIds } },
        select: {
          id: true,
          totalAmount: true,
          table: { select: { code: true } },
          member: { select: { adventurerName: true } },
        },
      })
    : [];

  return entries.map((e) => {
    const session = sessions.find((s) => s.id === e.entityId);
    const type: "VOIDED" | "REFUNDED" =
      e.action === "VOID_TRANSACTION" ? "VOIDED" : "REFUNDED";
    return {
      id: e.id,
      createdAt: e.createdAt,
      type,
      tableCode: session?.table.code ?? "—",
      memberName: session?.member?.adventurerName ?? null,
      staffName: e.staff?.name ?? "Unknown",
      amount: type === "REFUNDED" ? toNum(session?.totalAmount ?? 0) : null,
      reason: e.reason ?? "—",
    };
  });
}

export type VoidRefundReport = Awaited<ReturnType<typeof buildVoidRefundReport>>;

/**
 * Member / CRM directory — every member, sorted by lifetime spending
 * (highest first, so "top spenders" is just the top of the list), with a
 * flag for whether they joined within the selected period ("new" vs
 * "returning"). Unlike the other reports here this isn't scoped to
 * activity *within* the range — lifetimeSpending/lifetimeExp are running
 * totals on the Member row itself, not period aggregates — the range only
 * decides the newInPeriod flag.
 */
export async function buildMemberCrmReport(prisma: PrismaClient, range: DateRange) {
  const { from, to } = range;
  const members = await prisma.member.findMany({
    include: { rank: { select: { nameEn: true } } },
    orderBy: { lifetimeSpending: "desc" },
  });

  return members.map((m) => ({
    id: m.id,
    adventurerName: m.adventurerName,
    rankName: m.rank?.nameEn ?? "—",
    lifetimeExp: m.lifetimeExp,
    lifetimeSpending: toNum(m.lifetimeSpending),
    visits: m.visits,
    status: m.status,
    joinDate: m.joinDate,
    lastVisit: m.lastVisit,
    newInPeriod: m.joinDate >= from && m.joinDate <= to,
  }));
}

export type MemberCrmReport = Awaited<ReturnType<typeof buildMemberCrmReport>>;

/**
 * Playtime by Pricing Type — table-fee revenue and session count broken
 * down by PricingType (e.g. Regular/Student/DND/Package, whatever's
 * configured in Back Office -> Settings), the table-time equivalent of
 * Sales by Category above but sourced from TableSession rather than
 * OrderItem. Sessions whose pricing type was later deleted (SetNull on
 * the FK) land in a "No pricing type" bucket rather than being dropped.
 */
export async function buildPlaytimeByPricingTypeReport(prisma: PrismaClient, range: DateRange) {
  const { from, to } = range;
  const sessions = await prisma.tableSession.findMany({
    where: { status: "CLOSED", paymentStatus: "PAID", endTime: { gte: from, lte: to } },
    select: {
      subtotalTableFee: true,
      startTime: true,
      endTime: true,
      pricingType: { select: { id: true, name: true, code: true, model: true } },
    },
  });

  const NONE_KEY = "__none__";
  const byType = new Map<
    string,
    { name: string; code: string; model: string; sessionCount: number; revenue: number; totalMinutes: number }
  >();
  for (const s of sessions) {
    const key = s.pricingType?.id ?? NONE_KEY;
    const existing = byType.get(key) ?? {
      name: s.pricingType?.name ?? "No pricing type",
      code: s.pricingType?.code ?? "—",
      model: s.pricingType?.model ?? "—",
      sessionCount: 0,
      revenue: 0,
      totalMinutes: 0,
    };
    existing.sessionCount += 1;
    existing.revenue += toNum(s.subtotalTableFee);
    if (s.endTime) {
      existing.totalMinutes += (s.endTime.getTime() - s.startTime.getTime()) / 60_000;
    }
    byType.set(key, existing);
  }

  return Array.from(byType.entries())
    .map(([key, v]) => ({
      pricingTypeId: key === NONE_KEY ? null : key,
      ...v,
      avgMinutes: v.sessionCount ? Math.round(v.totalMinutes / v.sessionCount) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export type PlaytimeByPricingTypeReport = Awaited<ReturnType<typeof buildPlaytimeByPricingTypeReport>>;
