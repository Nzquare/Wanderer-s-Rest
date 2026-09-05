import Link from "next/link";
import { prisma } from "@/server/db";
import { Card } from "@/components/ui/card";
import { TableStatusBadge } from "@/components/ui/status-badge";
import { buildSummaryReport, parseDateRange } from "@/server/reports/build";
import { toNum } from "@/lib/decimal";
import type { TableStatus } from "@/generated/prisma/enums";

// A manager opening Back Office wants one thing first: "is anything on fire
// right now, and how's today going" — not a handful of all-time entity
// counts. Everything below is scoped to *today* and *right now* on
// purpose; historical trends already have a home in Reports (§13).
export default async function BackOfficeDashboard() {
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [
    summary,
    openShift,
    tableStatusCounts,
    soldOutItems,
    todaysReservations,
    recentActivity,
    staffCount,
  ] = await Promise.all([
    buildSummaryReport(prisma, parseDateRange(todayISO, todayISO)),
    prisma.shift.findFirst({
      where: { status: "OPEN" },
      orderBy: { openedAt: "desc" },
      include: { openedBy: { select: { name: true } } },
    }),
    // Quick Sale walk-in/delivery/split tables (kind !== STANDARD) aren't
    // part of the floor plan — same filter Back Office's own Tables list
    // uses — so they don't skew the "Tables occupied" snapshot.
    prisma.restaurantTable.groupBy({
      by: ["status"],
      where: { active: true, kind: "STANDARD" },
      _count: { _all: true },
    }),
    prisma.menuItem.findMany({
      where: { soldOut: true, active: true },
      select: { id: true, nameEn: true },
      orderBy: { nameEn: "asc" },
    }),
    prisma.reservation.findMany({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        date: { gte: startOfToday, lt: startOfTomorrow },
      },
      include: { type: { select: { nameEn: true } }, table: { select: { name: true } } },
      orderBy: { startTime: "asc" },
      take: 8,
    }),
    prisma.auditLog.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { staff: { select: { name: true } } },
    }),
    prisma.staff.count({ where: { status: "ACTIVE" } }),
  ]);

  // Only payments through a method flagged countsAsCash (§Payment
  // methods — manage your own) count toward the physical drawer.
  const shiftCashTotal = openShift
    ? toNum(
        (
          await prisma.payment.aggregate({
            where: { shiftId: openShift.id, status: "COMPLETED", method: { countsAsCash: true } },
            _sum: { amount: true },
          })
        )._sum.amount,
      )
    : 0;
  const expectedCash = openShift ? toNum(openShift.startingCash) + shiftCashTotal : 0;

  const countsByStatus = Object.fromEntries(
    tableStatusCounts.map((row) => [row.status, row._count._all]),
  ) as Partial<Record<TableStatus, number>>;
  const totalActiveTables = tableStatusCounts.reduce((sum, row) => sum + row._count._all, 0);
  const occupiedCount =
    (countsByStatus.PLAYING ?? 0) +
    (countsByStatus.PAUSED ?? 0) +
    (countsByStatus.READY_TO_CHECKOUT ?? 0) +
    (countsByStatus.CHECKOUT_IN_PROGRESS ?? 0);
  const needsCheckoutCount =
    (countsByStatus.READY_TO_CHECKOUT ?? 0) + (countsByStatus.CHECKOUT_IN_PROGRESS ?? 0);

  const floorStatuses: TableStatus[] = [
    "PLAYING",
    "PAUSED",
    "READY_TO_CHECKOUT",
    "RESERVED",
    "AVAILABLE",
    "CLEANING",
  ];

  const statCards = [
    { label: "Revenue today", value: `฿${summary.sales.totalRevenue.toFixed(0)}` },
    { label: "Bills closed today", value: summary.sales.paidSessionCount },
    { label: "Avg bill", value: `฿${summary.sales.avgBill.toFixed(0)}` },
    { label: "Tables occupied", value: `${occupiedCount} / ${totalActiveTables}` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-foreground-muted">
          Wanderer&apos;s Rest — Back Office · {now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Shift status — the one thing that gates whether the floor can even
          open tables (§47), so it leads. */}
      <Card
        className={
          openShift
            ? "flex flex-wrap items-center justify-between gap-3 border-status-success/30 bg-status-success/5"
            : "flex flex-wrap items-center justify-between gap-3 border-status-danger/30 bg-status-danger/5"
        }
      >
        {openShift ? (
          <>
            <div>
              <p className="text-sm font-semibold text-status-success">Shift open</p>
              <p className="text-xs text-foreground-muted">
                Opened by {openShift.openedBy.name} at{" "}
                {openShift.openedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-foreground-muted">Starting cash</p>
                <p className="font-semibold text-foreground">฿{toNum(openShift.startingCash).toFixed(0)}</p>
              </div>
              <div>
                <p className="text-foreground-muted">Expected cash now</p>
                <p className="font-semibold text-foreground">฿{expectedCash.toFixed(0)}</p>
              </div>
            </div>
            <Link href="/cashier/shift" className="text-sm font-medium text-teal-600 hover:underline">
              View shift →
            </Link>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm font-semibold text-status-danger">No shift open</p>
              <p className="text-xs text-foreground-muted">
                Tables can&apos;t be opened until a shift starts (§Require an open shift).
              </p>
            </div>
            <Link href="/cashier/shift" className="text-sm font-medium text-teal-600 hover:underline">
              Open a shift →
            </Link>
          </>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <p className="text-3xl font-semibold text-brand-700 dark:text-teal-400">{stat.value}</p>
            <p className="text-sm text-foreground-muted">{stat.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Live floor status */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Floor right now</h2>
            <Link href="/back-office/tables" className="text-xs font-medium text-teal-600 hover:underline">
              Manage tables →
            </Link>
          </div>
          {totalActiveTables === 0 ? (
            <p className="text-sm text-foreground-muted">No active tables set up yet.</p>
          ) : (
            <div className="space-y-2">
              {floorStatuses
                .filter((status) => (countsByStatus[status] ?? 0) > 0)
                .map((status) => (
                  <div key={status} className="flex items-center justify-between">
                    <TableStatusBadge status={status} />
                    <span className="text-sm font-medium text-foreground">
                      {countsByStatus[status]}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </Card>

        {/* Payment methods today — whichever ones actually got used
            (§Payment methods — manage your own), not a fixed
            Cash/PromptPay/Card/Other set. */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Payments today</h2>
          <div className="space-y-2 text-sm">
            {summary.payments.map((m) => (
              <div key={m.name} className="flex items-center justify-between">
                <span className="text-foreground-muted">{m.name}</span>
                <span className="font-medium text-foreground">฿{m.total.toFixed(0)}</span>
              </div>
            ))}
            {summary.payments.length === 0 && (
              <p className="text-foreground-muted">No payments yet today.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Needs attention */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Needs attention</h2>
          {needsCheckoutCount === 0 && soldOutItems.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nothing outstanding — all clear.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {needsCheckoutCount > 0 && (
                <li className="flex items-center justify-between rounded-lg bg-teal-500/10 px-3 py-2">
                  <span className="text-foreground">
                    {needsCheckoutCount} table{needsCheckoutCount === 1 ? "" : "s"} waiting on checkout
                  </span>
                  <Link href="/cashier" className="text-xs font-medium text-teal-600 hover:underline">
                    Go to Cashier →
                  </Link>
                </li>
              )}
              {soldOutItems.length > 0 && (
                <li className="rounded-lg bg-status-warning/10 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">
                      {soldOutItems.length} menu item{soldOutItems.length === 1 ? "" : "s"} marked sold out
                    </span>
                    <Link href="/back-office/menu" className="text-xs font-medium text-teal-600 hover:underline">
                      Manage menu →
                    </Link>
                  </div>
                  <p className="mt-1 text-xs text-foreground-muted">
                    {soldOutItems.map((item) => item.nameEn).join(", ")}
                  </p>
                </li>
              )}
            </ul>
          )}
        </Card>

        {/* Today's reservations */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Today&apos;s reservations</h2>
            <Link href="/back-office/reservations" className="text-xs font-medium text-teal-600 hover:underline">
              View all →
            </Link>
          </div>
          {todaysReservations.length === 0 ? (
            <p className="text-sm text-foreground-muted">No reservations booked for today.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {todaysReservations.map((r) => (
                <li key={r.id} className="flex items-center justify-between">
                  <span className="text-foreground">
                    {r.startTime.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} ·{" "}
                    {r.customerName} ({r.partySize})
                  </span>
                  <span className="text-xs text-foreground-muted">
                    {r.table?.name ?? r.type.nameEn}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top sellers today */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Top sellers today</h2>
          {summary.topItems.length === 0 ? (
            <p className="text-sm text-foreground-muted">No orders yet today.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {summary.topItems.map((item) => (
                <li key={item.name} className="flex items-center justify-between">
                  <span className="text-foreground">{item.name}</span>
                  <span className="text-foreground-muted">×{item.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent activity */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
            <Link href="/back-office/reports" className="text-xs font-medium text-teal-600 hover:underline">
              Full audit log →
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nothing logged yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-foreground">
                    {entry.action.replace(/_/g, " ").toLowerCase()}
                    <span className="text-foreground-muted"> · {entry.staff?.name ?? "System"}</span>
                  </span>
                  <span className="shrink-0 text-xs text-foreground-muted">
                    {entry.createdAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Catalog snapshot — the old all-time counts, kept but demoted to a
          footer strip since they rarely change day to day. */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xl font-semibold text-foreground">{totalActiveTables}</p>
          <p className="text-sm text-foreground-muted">Active tables</p>
        </Card>
        <Card>
          <p className="text-xl font-semibold text-foreground">{staffCount}</p>
          <p className="text-sm text-foreground-muted">Active staff</p>
        </Card>
        <Card>
          <p className="text-xl font-semibold text-foreground">{summary.membership.totalMembers}</p>
          <p className="text-sm text-foreground-muted">Members</p>
        </Card>
        <Card>
          <p className="text-xl font-semibold text-foreground">{summary.membership.newMembers}</p>
          <p className="text-sm text-foreground-muted">New members today</p>
        </Card>
      </div>
    </div>
  );
}
