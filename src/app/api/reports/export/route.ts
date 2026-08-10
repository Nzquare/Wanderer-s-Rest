import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentStaff } from "@/server/auth/current-user";
import { can } from "@/server/rbac/can";
import { Permission } from "@/server/rbac/permissions";
import { prisma } from "@/server/db";
import {
  buildSummaryReport,
  buildTransactionsReport,
  parseDateRange,
  type SummaryReport,
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
  stat("Cash (฿)", report.payments.CASH.toFixed(2));
  stat("PromptPay (฿)", report.payments.PROMPTPAY.toFixed(2));
  stat("Card (฿)", report.payments.CARD.toFixed(2));
  stat("Other (฿)", report.payments.OTHER.toFixed(2));

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
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow({ ...row, endTime: row.endTime ? new Date(row.endTime).toLocaleString() : "" });
  }
}

export async function GET(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!can(staff, Permission.VIEW_REPORTS)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") === "transactions" ? "transactions" : "summary";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return new Response("Missing from/to date params", { status: 400 });
  }
  const range = parseDateRange(from, to);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Wanderer's Rest";
  workbook.created = new Date();

  if (type === "transactions") {
    buildTransactionsSheet(workbook, await buildTransactionsReport(prisma, range));
  } else {
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
