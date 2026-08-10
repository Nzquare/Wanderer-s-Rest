"use client";

import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc/client";
import type { AppRouter } from "@/server/trpc/routers/_app";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StaffAssignSelect } from "@/components/ui/staff-assign-select";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type TransactionRowData = RouterOutputs["reports"]["transactions"][number];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-xs text-foreground-muted">{label}</p>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-status-success/15 text-status-success",
  REFUNDED: "bg-status-warning/15 text-status-warning",
  VOIDED: "bg-status-danger/15 text-status-danger",
  UNPAID: "bg-status-neutral/15 text-status-neutral",
  PARTIAL: "bg-status-neutral/15 text-status-neutral",
};

function ExcelDownloadLink({ type, from, to }: { type: "summary" | "transactions"; from: string; to: string }) {
  return (
    <a
      href={`/api/reports/export?type=${type}&from=${from}&to=${to}`}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/5"
    >
      ⬇ Download Excel
    </a>
  );
}

/** One row in the Transactions detail table, with a Void/Refund action for paid bills. */
function TransactionRow({ tx }: { tx: TransactionRowData }) {
  const utils = trpc.useUtils();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [staffId, setStaffId] = useState("");
  const refund = trpc.sessions.refundSession.useMutation({
    onSuccess: async () => {
      setConfirming(false);
      setReason("");
      setStaffId("");
      await utils.reports.transactions.invalidate();
    },
  });

  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="whitespace-nowrap px-3 py-2 text-xs text-foreground-muted">
          {tx.endTime ? new Date(tx.endTime).toLocaleString() : "—"}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-xs text-foreground-muted">
          {tx.receiptNumber ?? "—"}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-foreground">{tx.tableCode}</td>
        <td className="whitespace-nowrap px-3 py-2 text-foreground-muted">{tx.memberName ?? "—"}</td>
        <td className="whitespace-nowrap px-3 py-2 text-foreground-muted">{tx.staffName ?? "—"}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right text-foreground">
          ฿{tx.totalAmount.toFixed(0)}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-foreground-muted">{tx.paymentMethods || "—"}</td>
        <td className="whitespace-nowrap px-3 py-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[tx.paymentStatus] ?? ""}`}>
            {tx.paymentStatus}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          {tx.paymentStatus === "PAID" &&
            (confirming ? (
              <button onClick={() => setConfirming(false)} className="text-xs text-foreground-muted underline">
                Cancel
              </button>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="text-xs font-medium text-status-danger underline"
              >
                Void / refund
              </button>
            ))}
        </td>
      </tr>
      {confirming && (
        <tr className="border-b border-border bg-background">
          <td colSpan={9} className="px-3 py-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-48">
                <label className="text-xs text-foreground-muted">Assigned to</label>
                <StaffAssignSelect value={staffId} onChange={setStaffId} className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm" />
              </div>
              <div className="min-w-64 flex-1">
                <label className="text-xs text-foreground-muted">
                  Reason (required — this bill has already been paid and checked out)
                </label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. customer disputed the charge, duplicate payment…"
                  className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm"
                />
              </div>
              <Button
                size="md"
                variant="danger"
                disabled={!reason.trim() || !staffId || refund.isPending}
                onClick={() => refund.mutate({ sessionId: tx.id, staffId, reason: reason.trim() })}
              >
                Confirm refund
              </Button>
            </div>
            <p className="mt-1 text-xs text-foreground-muted">
              This marks the bill Refunded and, if a member was linked, reverses the EXP/rank and
              lifetime spending it earned them — logged as its own history entry, not erased.
              Achievements already unlocked from it are left alone.
            </p>
            {refund.error && <p className="mt-1 text-xs text-status-danger">{refund.error.message}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

function TransactionsTable({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = trpc.reports.transactions.useQuery({ from, to });

  if (isLoading || !data) return <p className="text-sm text-foreground-muted">Loading…</p>;

  return (
    <Card className="overflow-x-auto p-0">
      <div className="flex items-center justify-between gap-2 border-b border-border p-4">
        <p className="font-medium text-foreground">Transactions ({data.length})</p>
        <ExcelDownloadLink type="transactions" from={from} to={to} />
      </div>
      {data.length === 0 ? (
        <p className="p-4 text-sm text-foreground-muted">No checked-out bills in range.</p>
      ) : (
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-foreground-muted">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Receipt #</th>
              <th className="px-3 py-2 font-medium">Table</th>
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium">Staff</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Payment</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function AuditLogTable() {
  const { data: auditLog } = trpc.reports.auditLog.useQuery();

  return (
    <Card className="overflow-x-auto p-0">
      {!auditLog || auditLog.length === 0 ? (
        <p className="p-4 text-sm text-foreground-muted">No audit entries yet.</p>
      ) : (
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-foreground-muted">
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Entity</th>
              <th className="px-3 py-2 font-medium">Staff</th>
              <th className="px-3 py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {auditLog.map((entry) => (
              <tr key={entry.id} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-foreground-muted">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                  {entry.action.replace(/_/g, " ")}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-foreground-muted">{entry.entityType}</td>
                <td className="whitespace-nowrap px-3 py-2 text-foreground-muted">
                  {entry.staff?.name ?? "System"}
                </td>
                <td className="px-3 py-2 text-foreground-muted">{entry.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function ReportsView() {
  const [from, setFrom] = useState(daysAgoISO(7));
  const [to, setTo] = useState(todayISO());
  const [tab, setTab] = useState<"overview" | "transactions" | "audit">("overview");
  const { data, isLoading } = trpc.reports.summary.useQuery({ from, to }, { enabled: tab === "overview" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-surface p-1">
          <button
            onClick={() => setTab("overview")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === "overview" ? "bg-teal-500 text-brand-950" : "text-foreground-muted"}`}
          >
            Overview
          </button>
          <button
            onClick={() => setTab("transactions")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === "transactions" ? "bg-teal-500 text-brand-950" : "text-foreground-muted"}`}
          >
            Transactions
          </button>
          <button
            onClick={() => setTab("audit")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === "audit" ? "bg-teal-500 text-brand-950" : "text-foreground-muted"}`}
          >
            Audit Log
          </button>
        </div>
        {tab !== "audit" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            />
            <span className="text-foreground-muted">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            />
          </div>
        )}
        {tab === "overview" && <ExcelDownloadLink type="summary" from={from} to={to} />}
      </div>

      {tab === "overview" &&
        (isLoading || !data ? (
          <p className="text-sm text-foreground-muted">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="space-y-3">
              <p className="font-medium text-foreground">Sales</p>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Total revenue" value={`฿${data.sales.totalRevenue.toFixed(0)}`} />
                <Stat label="Avg bill" value={`฿${data.sales.avgBill.toFixed(0)}`} />
                <Stat label="Table fee revenue" value={`฿${data.sales.tableFeeRevenue.toFixed(0)}`} />
                <Stat label="Food/drink revenue" value={`฿${data.sales.foodDrinkRevenue.toFixed(0)}`} />
                <Stat label="Member revenue" value={`฿${data.sales.memberRevenue.toFixed(0)}`} />
                <Stat label="Non-member revenue" value={`฿${data.sales.nonMemberRevenue.toFixed(0)}`} />
              </div>
            </Card>

            <Card className="space-y-3">
              <p className="font-medium text-foreground">Payments</p>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Cash" value={`฿${data.payments.CASH.toFixed(0)}`} />
                <Stat label="PromptPay" value={`฿${data.payments.PROMPTPAY.toFixed(0)}`} />
                <Stat label="Card" value={`฿${data.payments.CARD.toFixed(0)}`} />
                <Stat label="Other" value={`฿${data.payments.OTHER.toFixed(0)}`} />
              </div>
            </Card>

            <Card className="space-y-3">
              <p className="font-medium text-foreground">Tables</p>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Sessions" value={String(data.table.totalSessions)} />
                <Stat label="Total table hours" value={data.table.totalTableHours.toFixed(1)} />
                <Stat
                  label="Avg session length"
                  value={`${Math.round(data.table.avgSessionMinutes)} min`}
                />
                <Stat label="Voided" value={String(data.voidRefund.voidedCount)} />
                <Stat label="Refunded" value={String(data.voidRefund.refundedCount)} />
              </div>
            </Card>

            <Card className="space-y-3">
              <p className="font-medium text-foreground">Discounts</p>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Applied" value={String(data.discounts.count)} />
                <Stat label="Total value" value={`฿${data.discounts.total.toFixed(0)}`} />
              </div>
            </Card>

            <Card className="space-y-3">
              <p className="font-medium text-foreground">Membership</p>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Total members" value={String(data.membership.totalMembers)} />
                <Stat label="Active members" value={String(data.membership.activeMembers)} />
                <Stat label="New this period" value={String(data.membership.newMembers)} />
              </div>
            </Card>

            <Card className="space-y-2">
              <p className="font-medium text-foreground">Best-selling items</p>
              {data.topItems.length === 0 && (
                <p className="text-sm text-foreground-muted">No orders in range.</p>
              )}
              {data.topItems.map((i, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-foreground">{i.name}</span>
                  <span className="text-foreground-muted">{i.quantity} sold</span>
                </div>
              ))}
            </Card>

            <Card className="space-y-2">
              <p className="font-medium text-foreground">Most played games</p>
              {data.topGames.length === 0 && (
                <p className="text-sm text-foreground-muted">No games recorded in range.</p>
              )}
              {data.topGames.map((g, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-foreground">{g.name}</span>
                  <span className="text-foreground-muted">{g.plays} plays</span>
                </div>
              ))}
            </Card>

            <Card className="space-y-2">
              <p className="font-medium text-foreground">Most unlocked achievements</p>
              {data.topAchievements.length === 0 && (
                <p className="text-sm text-foreground-muted">None unlocked in range.</p>
              )}
              {data.topAchievements.map((a, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-foreground">{a.name}</span>
                  <span className="text-foreground-muted">{a.count}×</span>
                </div>
              ))}
            </Card>
          </div>
        ))}

      {tab === "transactions" && <TransactionsTable from={from} to={to} />}

      {tab === "audit" && <AuditLogTable />}
    </div>
  );
}
