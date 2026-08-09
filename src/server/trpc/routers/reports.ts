import { z } from "zod";
import { router, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { toNum } from "@/lib/decimal";

const dateRange = z.object({
  from: z.string(), // ISO date
  to: z.string(),
});

const viewReports = () => permissionProcedure(Permission.VIEW_REPORTS);

export const reportsRouter = router({
  summary: viewReports()
    .input(dateRange)
    .query(async ({ ctx, input }) => {
      const from = new Date(input.from);
      const to = new Date(new Date(input.to).setHours(23, 59, 59, 999));
      const closedInRange = { status: "CLOSED" as const, endTime: { gte: from, lte: to } };

      const [sessions, payments, discounts, memberSessions, totalMembers, activeMembers, newMembers] =
        await Promise.all([
          ctx.prisma.tableSession.findMany({
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
          ctx.prisma.payment.findMany({
            where: { createdAt: { gte: from, lte: to }, status: "COMPLETED" },
            select: { method: true, amount: true },
          }),
          ctx.prisma.appliedDiscount.findMany({
            where: { createdAt: { gte: from, lte: to } },
            select: { amount: true, label: true },
          }),
          ctx.prisma.tableSession.findMany({
            where: { ...closedInRange, memberId: { not: null } },
            select: { totalAmount: true },
          }),
          ctx.prisma.member.count(),
          ctx.prisma.member.count({ where: { status: "ACTIVE" } }),
          ctx.prisma.member.count({ where: { joinDate: { gte: from, lte: to } } }),
        ]);

      const paidSessions = sessions.filter((s) => s.paymentStatus === "PAID");
      const voidedSessions = sessions.filter((s) => s.paymentStatus === "VOIDED");

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
        ctx.prisma.orderItem.groupBy({
          by: ["nameSnapshotEn"],
          where: { order: { createdAt: { gte: from, lte: to } } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 5,
        }),
        ctx.prisma.gameSession.groupBy({
          by: ["gameId"],
          where: { playedAt: { gte: from, lte: to } },
          _count: { _all: true },
          orderBy: { _count: { gameId: "desc" } },
          take: 5,
        }),
        ctx.prisma.memberAchievement.groupBy({
          by: ["achievementId"],
          where: { unlockedAt: { gte: from, lte: to } },
          _count: { _all: true },
          orderBy: { _count: { achievementId: "desc" } },
          take: 5,
        }),
      ]);

      const gameIds = topGames.map((g) => g.gameId);
      const games = gameIds.length
        ? await ctx.prisma.game.findMany({ where: { id: { in: gameIds } } })
        : [];
      const achievementIds = topAchievements.map((a) => a.achievementId);
      const achievements = achievementIds.length
        ? await ctx.prisma.achievement.findMany({ where: { id: { in: achievementIds } } })
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
    }),

  auditLog: viewReports()
    .input(z.object({ entityType: z.string().optional() }).optional())
    .query(({ ctx, input }) => {
      return ctx.prisma.auditLog.findMany({
        where: input?.entityType ? { entityType: input.entityType } : undefined,
        include: { staff: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }),
});
