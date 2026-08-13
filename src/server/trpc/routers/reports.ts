import { z } from "zod";
import { router, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import {
  buildSummaryReport,
  buildTransactionsReport,
  buildSalesByCategoryReport,
  buildSalesByProductReport,
  buildGamesPlayedReport,
  buildPromotionUsageReport,
  parseDateRange,
} from "@/server/reports/build";

const dateRange = z.object({
  from: z.string(), // ISO date
  to: z.string(),
});

const viewReports = () => permissionProcedure(Permission.VIEW_REPORTS);

export const reportsRouter = router({
  summary: viewReports()
    .input(dateRange)
    .query(({ ctx, input }) => {
      return buildSummaryReport(ctx.prisma, parseDateRange(input.from, input.to));
    }),

  /** Detail report (§43) — one row per checked-out bill, for the "Transactions" tab and Excel export. */
  transactions: viewReports()
    .input(dateRange)
    .query(({ ctx, input }) => {
      return buildTransactionsReport(ctx.prisma, parseDateRange(input.from, input.to));
    }),

  salesByCategory: viewReports()
    .input(dateRange)
    .query(({ ctx, input }) => {
      return buildSalesByCategoryReport(ctx.prisma, parseDateRange(input.from, input.to));
    }),

  salesByProduct: viewReports()
    .input(dateRange)
    .query(({ ctx, input }) => {
      return buildSalesByProductReport(ctx.prisma, parseDateRange(input.from, input.to));
    }),

  gamesPlayed: viewReports()
    .input(dateRange)
    .query(({ ctx, input }) => {
      return buildGamesPlayedReport(ctx.prisma, parseDateRange(input.from, input.to));
    }),

  promotionUsage: viewReports()
    .input(dateRange)
    .query(({ ctx, input }) => {
      return buildPromotionUsageReport(ctx.prisma, parseDateRange(input.from, input.to));
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
