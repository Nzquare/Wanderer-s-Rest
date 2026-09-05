import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentStaff } from "@/server/auth/current-user";
import { can } from "@/server/rbac/can";
import { Permission } from "@/server/rbac/permissions";
import { prisma } from "@/server/db";
import {
  buildSummaryReport,
  buildTransactionsReport,
  buildSalesByCategoryReport,
  buildSalesByProductReport,
  buildGamesPlayedReport,
  buildPromotionUsageReport,
  buildShiftReconciliationReport,
  buildVoidRefundReport,
  buildMemberCrmReport,
  buildPlaytimeByPricingTypeReport,
  parseDateRange,
  type SummaryReport,
  type SalesByCategoryReport,
  type SalesByProductReport,
  type GamesPlayedReport,
  type PromotionUsageReport,
  type ShiftReconciliationReport,
  type VoidRefundReport,
  type MemberCrmReport,
  type PlaytimeByPricingTypeReport,
} from "@/server/reports/build";

/**
 * Excel export for the Reports screen (§43). A plain Route Handler rather
 * than a tRPC procedure — tRPC/superjson round-trips JSON, not a binary
 * .xlsx buffer — but it reuses the exact same query-building functions the
 * in-app tables call, so the numbers always match what staff already see
 * on screen before downloading.
 */

function buildSummarySheet(workbook: ExcelJS.Workbook, report: SummaryReport) {
  const sheet = workbook.addWorksheet("Summary");
  sheet.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };

  const section = (title: string) => {
    const row = sheet.addRow({ metric: title });
    row.font = { bold: true };
  };
  const stat = (label: string, value: string | number) => sheet.addRow({ metric: label, value });

  section("Sales");
  stat("Total revenue (฿)", report.sales.totalRevenue.toFixed(2));
  stat("Avg bill (฿)", report.sales.avgBill.toFixed(2));
  stat("Table fee revenue (฿)", report.sales.tableFeeRevenue.toFixed(2));
  stat("Food/drink revenue (฿)", report.sales.foodDrinkRevenue.toFixed(2));
  stat("Member revenue (฿)", report.sales.memberRevenue.toFixed(2));
  stat("Non-member revenue (฿)", report.sales.nonMemberRevenue.toFixed(2));
  stat("Paid sessions", report.sales.paidSessionCount);

  sheet.addRow({});
  section("Payments");
  // Whichever payment methods actually got used in range (§Payment
  // methods — manage your own), not a fixed Cash/PromptPay/Card/Other
  // set.
  for (const m of report.payments) {
    stat(`${m.name} (฿)`, m.total.toFixed(2));
  }

  sheet.addRow({});
  section("Tables");
  stat("Sessions", report.table.totalSessions);
  stat("Total table hours", report.table.totalTableHours.toFixed(1));
  stat("Avg session length (min)", Math.round(report.table.avgSessionMinutes));
  stat("Voided", report.voidRefund.voidedCount);
  stat("Refunded", report.voidRefund.refundedCount);

  sheet.addRow({});
  section("Discounts");
  stat("Applied", report.discounts.count);
  stat("Total value (฿)", report.discounts.total.toFixed(2));

  sheet.addRow({});
  section("Membership");
  stat("Total members", report.membership.totalMembers);
  stat("Active members", report.membership.activeMembers);
  stat("New this period", report.membership.newMembers);

  const topList = (title: string, rows: { name: string; quantity?: number; plays?: number; count?: number }[]) => {
    sheet.addRow({});
    section(title);
    for (const r of rows) {
      sheet.addRow({ metric: r.name, value: r.quantity ?? r.plays ?? r.count ?? 0 });
    }
    if (rows.length === 0) sheet.addRow({ metric: "(none in range)" });
  };
  topList("Best-selling items", report.topItems);
  topList("Most played games", report.topGames);
  topList("Most unlocked achievements", report.topAchievements);
}

function buildTransactionsSheet(
  workbook: ExcelJS.Workbook,
  rows: Awaited<ReturnType<typeof buildTransactionsReport>>,
) {
  const sheet = workbook.addWorksheet("Transactions");
  sheet.columns = [
    { header: "Date", key: "endTime", width: 20 },
    { header: "Receipt #", key: "receiptNumber", width: 20 },
    { header: "Table", key: "tableCode", width: 10 },
    { header: "Member", key: "memberName", width: 20 },
    { header: "Staff", key: "staffName", width: 16 },
    { header: "Table fee (฿)", key: "subtotalTableFee", width: 14 },
    { header: "Food/drink (฿)", key: "subtotalFoodDrink", width: 14 },
    { header: "Discount (฿)", key: "discountTotal", width: 14 },
    { header: "Tax (฿)", key: "taxAmount", width: 12 },
    { header: "Service (฿)", key: "serviceChargeAmount", width: 12 },
    { header: "Total (฿)", key: "totalAmount", width: 14 },
    { header: "Payment method(s)", key: "paymentMethods", width: 20 },
    { header: "Status", key: "paymentStatus", width: 12 },
    { header: "EXP awarded", key: "expAwarded", width: 12 },
    // Who actually did the void/refund and why (§Transactions: record
    // void/refund by who and why) — blank for an ordinary PAID row.
    { header: "Voided/refunded by", key: "voidedOrRefundedBy", width: 18 },
    { header: "Void/refund reason", key: "voidedOrRefundedReason", width: 28 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow({ ...row, endTime: row.endTime ? new Date(row.endTime).toLocaleString() : "" });
  }
}

function buildSalesByCategorySheet(workbook: ExcelJS.Workbook, rows: SalesByCategoryReport) {
  const sheet = workbook.addWorksheet("Sales by Category");
  sheet.columns = [
    { header: "Category", key: "categoryName", width: 28 },
    { header: "Qty sold", key: "quantity", width: 12 },
    { header: "Revenue (฿)", key: "revenue", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow({ categoryName: row.categoryName, quantity: row.quantity, revenue: row.revenue.toFixed(2) });
  }
}

function buildSalesByProductSheet(workbook: ExcelJS.Workbook, rows: SalesByProductReport) {
  const sheet = workbook.addWorksheet("Sales by Product");
  sheet.columns = [
    { header: "Product", key: "name", width: 28 },
    { header: "Category", key: "categoryName", width: 22 },
    { header: "Qty sold", key: "quantity", width: 12 },
    { header: "Revenue (฿)", key: "revenue", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow({
      name: row.name,
      categoryName: row.categoryName,
      quantity: row.quantity,
      revenue: row.revenue.toFixed(2),
    });
  }
}

function buildPlaytimeByPricingTypeSheet(workbook: ExcelJS.Workbook, rows: PlaytimeByPricingTypeReport) {
  const sheet = workbook.addWorksheet("Playtime by Pricing Type");
  sheet.columns = [
    { header: "Pricing type", key: "name", width: 24 },
    { header: "Code", key: "code", width: 14 },
    { header: "Model", key: "model", width: 12 },
    { header: "Sessions", key: "sessionCount", width: 12 },
    { header: "Avg length (min)", key: "avgMinutes", width: 16 },
    { header: "Playtime revenue (฿)", key: "revenue", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow({
      name: row.name,
      code: row.code,
      model: row.model,
      sessionCount: row.sessionCount,
      avgMinutes: row.avgMinutes,
      revenue: row.revenue.toFixed(2),
    });
  }
}

function buildGamesPlayedSheet(workbook: ExcelJS.Workbook, rows: GamesPlayedReport) {
  const sheet = workbook.addWorksheet("Games Played");
  sheet.columns = [
    { header: "Game", key: "name", width: 28 },
    { header: "Category", key: "categoryName", width: 22 },
    { header: "Plays", key: "plays", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow({ name: row.name, categoryName: row.categoryName, plays: row.plays });
  }
}

function buildPromotionUsageSheet(workbook: ExcelJS.Workbook, rows: PromotionUsageReport) {
  const sheet = workbook.addWorksheet("Promotions");
  sheet.columns = [
    { header: "Promotion", key: "name", width: 28 },
    { header: "Times used", key: "usageCount", width: 14 },
    { header: "Total discount (฿)", key: "totalDiscount", width: 18 },
    // Separate column, not folded into "Total discount" — an EXP_BONUS
    // promotion's total is a raw EXP number, not money (§Award EXP as
    // promotion), and a given promotion row only ever has one or the
    // other populated.
    { header: "Total EXP awarded", key: "totalExpAwarded", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow({
      name: row.name,
      usageCount: row.usageCount,
      totalDiscount: row.totalDiscount.toFixed(2),
      totalExpAwarded: row.totalExpAwarded,
    });
  }
}

function buildShiftReconciliationSheet(workbook: ExcelJS.Workbook, rows: ShiftReconciliationReport) {
  const sheet = workbook.addWorksheet("Shift Reconciliation");
  sheet.columns = [
    { header: "Opened", key: "openedAt", width: 20 },
    { header: "Closed", key: "closedAt", width: 20 },
    { header: "Opened by", key: "openedByName", width: 18 },
    { header: "Closed by", key: "closedByName", width: 18 },
    { header: "Status", key: "status", width: 10 },
    { header: "Starting cash (฿)", key: "startingCash", width: 16 },
    { header: "Expected (฿)", key: "expectedCash", width: 14 },
    { header: "Actual (฿)", key: "actualCashCounted", width: 14 },
    { header: "Difference (฿)", key: "cashDifference", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow({
      openedAt: new Date(row.openedAt).toLocaleString(),
      closedAt: row.closedAt ? new Date(row.closedAt).toLocaleString() : "",
      openedByName: row.openedByName,
      closedByName: row.closedByName ?? "",
      status: row.status,
      startingCash: row.startingCash.toFixed(2),
      expectedCash: row.expectedCash != null ? row.expectedCash.toFixed(2) : "",
      actualCashCounted: row.actualCashCounted != null ? row.actualCashCounted.toFixed(2) : "",
      cashDifference: row.cashDifference != null ? row.cashDifference.toFixed(2) : "",
    });
  }
}

function buildVoidRefundSheet(workbook: ExcelJS.Workbook, rows: VoidRefundReport) {
  const sheet = workbook.addWorksheet("Void & Refund");
  sheet.columns = [
    { header: "Date", key: "createdAt", width: 20 },
    { header: "Type", key: "type", width: 12 },
    { header: "Table", key: "tableCode", width: 10 },
    { header: "Member", key: "memberName", width: 20 },
    { header: "Staff", key: "staffName", width: 16 },
    { header: "Amount (฿)", key: "amount", width: 14 },
    { header: "Reason", key: "reason", width: 40 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow({
      createdAt: new Date(row.createdAt).toLocaleString(),
      type: row.type,
      tableCode: row.tableCode,
      memberName: row.memberName ?? "",
      staffName: row.staffName,
      amount: row.amount != null ? row.amount.toFixed(2) : "",
      reason: row.reason,
    });
  }
}

function buildMemberCrmSheet(workbook: ExcelJS.Workbook, rows: MemberCrmReport) {
  const sheet = workbook.addWorksheet("Member CRM");
  sheet.columns = [
    { header: "Adventurer", key: "adventurerName", width: 24 },
    { header: "Rank", key: "rankName", width: 16 },
    { header: "Lifetime EXP", key: "lifetimeExp", width: 14 },
    { header: "Lifetime spending (฿)", key: "lifetimeSpending", width: 18 },
    { header: "Visits", key: "visits", width: 10 },
    { header: "Joined", key: "joinDate", width: 14 },
    { header: "Last visit", key: "lastVisit", width: 14 },
    { header: "Status", key: "status", width: 10 },
    { header: "New in period", key: "newInPeriod", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow({
      adventurerName: row.adventurerName,
      rankName: row.rankName,
      lifetimeExp: row.lifetimeExp,
      lifetimeSpending: row.lifetimeSpending.toFixed(2),
      visits: row.visits,
      joinDate: new Date(row.joinDate).toLocaleDateString(),
      lastVisit: row.lastVisit ? new Date(row.lastVisit).toLocaleDateString() : "",
      status: row.status,
      newInPeriod: row.newInPeriod ? "Yes" : "No",
    });
  }
}

export async function GET(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!can(staff, Permission.VIEW_REPORTS)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const VALID_TYPES = [
    "summary",
    "transactions",
    "salesByCategory",
    "salesByProduct",
    "playtimeByPricingType",
    "gamesPlayed",
    "promotionUsage",
    "shiftReconciliation",
    "voidRefund",
    "memberCrm",
  ] as const;
  const rawType = searchParams.get("type");
  const type = (VALID_TYPES as readonly string[]).includes(rawType ?? "")
    ? (rawType as (typeof VALID_TYPES)[number])
    : "summary";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return new Response("Missing from/to date params", { status: 400 });
  }
  const range = parseDateRange(from, to);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Wanderer's Rest";
  workbook.created = new Date();

  switch (type) {
    case "transactions":
      buildTransactionsSheet(workbook, await buildTransactionsReport(prisma, range));
      break;
    case "salesByCategory":
      buildSalesByCategorySheet(workbook, await buildSalesByCategoryReport(prisma, range));
      break;
    case "salesByProduct":
      buildSalesByProductSheet(workbook, await buildSalesByProductReport(prisma, range));
      break;
    case "playtimeByPricingType":
      buildPlaytimeByPricingTypeSheet(workbook, await buildPlaytimeByPricingTypeReport(prisma, range));
      break;
    case "gamesPlayed":
      buildGamesPlayedSheet(workbook, await buildGamesPlayedReport(prisma, range));
      break;
    case "promotionUsage":
      buildPromotionUsageSheet(workbook, await buildPromotionUsageReport(prisma, range));
      break;
    case "shiftReconciliation":
      buildShiftReconciliationSheet(workbook, await buildShiftReconciliationReport(prisma, range));
      break;
    case "voidRefund":
      buildVoidRefundSheet(workbook, await buildVoidRefundReport(prisma, range));
      break;
    case "memberCrm":
      buildMemberCrmSheet(workbook, await buildMemberCrmReport(prisma, range));
      break;
    default:
      buildSummarySheet(workbook, await buildSummaryReport(prisma, range));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `wanderers-rest-${type}-${from}-to-${to}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
