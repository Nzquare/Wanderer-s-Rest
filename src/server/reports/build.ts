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
        select: { amount: true, label: true },
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

  const gameIds = topGames.map((g) => g.gameId);
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
      total: discounts.reduce((s, d) => s + toNum(d.amount), 0),
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
      closedBy: { select: { name: true } },
      payments: { where: { status: "COMPLETED" }, select: { method: true, amount: true } },
      receipt: { select: { receiptNumber: true } },
    },
    orderBy: { endTime: "desc" },
  });

  return sessions.map((s) => ({
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
  }));
}

export type TransactionsReport = Awaited<ReturnType<typeof buildTransactionsReport>>;

/**
 * Sales by Category — every menu category's items ordered in range, not
 * just the Overview's top-5 items. Revenue is quantity × the *snapshotted*
 * unit price on each order item (§45: never recomputed from the live menu
 * item price), summed per category. groupBy can't do a computed
 * quantity×price sum in Prisma, so this pulls the raw rows and reduces in
 * JS — fine at café-scale order volumes.
 */
export async function buildSalesByCategoryReport(prisma: PrismaClient, range: DateRange) {
  const { from, to } = range;
  const items = await prisma.orderItem.findMany({
    where: { order: { createdAt: { gte: from, lte: to } } },
    select: {
      quantity: true,
      unitPriceSnapshot: true,
      menuItem: { select: { category: { select: { id: true, nameEn: true } } } },
    },
  });

  const byCategory = new Map<string, { categoryName: string; quantity: number; revenue: number }>();
  for (const item of items) {
    const catId = item.menuItem.category.id;
    const existing = byCategory.get(catId) ?? {
      categoryName: item.menuItem.category.nameEn,
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
 * buildSalesByCategoryReport above.
 */
export async function buildSalesByProductReport(prisma: PrismaClient, range: DateRange) {
  const { from, to } = range;
  const items = await prisma.orderItem.findMany({
    where: { order: { createdAt: { gte: from, lte: to } } },
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
    { name: string; categoryName: string; quantity: number; revenue: number }
  >();
  for (const item of items) {
    const existing = byItem.get(item.menuItemId) ?? {
      name: item.nameSnapshotEn,
      categoryName: item.menuItem.category.nameEn,
      quantity: 0,
      revenue: 0,
    };
    existing.quantity += item.quantity;
    existing.revenue += toNum(item.unitPriceSnapshot) * item.quantity;
    byItem.set(item.menuItemId, existing);
  }

  return Array.from(byItem.entries())
    .map(([menuItemId, v]) => ({ menuItemId, ...v }))
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

  const gameIds = grouped.map((g) => g.gameId);
  const games = gameIds.length
    ? await prisma.game.findMany({
        where: { id: { in: gameIds } },
        include: { category: { select: { nameEn: true } } },
      })
    : [];

  return grouped.map((g) => {
    const game = games.find((x) => x.id === g.gameId);
    return {
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
    select: { promotionId: true, amount: true, promotion: { select: { name: true } } },
  });

  const MANUAL_KEY = "__manual__";
  const byPromo = new Map<string, { name: string; usageCount: number; totalDiscount: number }>();
  for (const d of discounts) {
    const key = d.promotionId ?? MANUAL_KEY;
    const existing = byPromo.get(key) ?? {
      name: d.promotion?.name ?? "Manual / custom discount",
      usageCount: 0,
      totalDiscount: 0,
    };
    existing.usageCount += 1;
    existing.totalDiscount += toNum(d.amount);
    byPromo.set(key, existing);
  }

  return Array.from(byPromo.entries())
    .map(([key, v]) => ({ promotionId: key === MANUAL_KEY ? null : key, ...v }))
    .sort((a, b) => b.totalDiscount - a.totalDiscount);
}

export type PromotionUsageReport = Awaited<ReturnType<typeof buildPromotionUsageReport>>;
