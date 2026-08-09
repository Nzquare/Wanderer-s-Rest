"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/card";

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

export function ReportsView() {
  const [from, setFrom] = useState(daysAgoISO(7));
  const [to, setTo] = useState(todayISO());
  const [tab, setTab] = useState<"reports" | "audit">("reports");
  const { data, isLoading } = trpc.reports.summary.useQuery({ from, to });
  const { data: auditLog } = trpc.reports.auditLog.useQuery(undefined, {
    enabled: tab === "audit",
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-surface p-1">
          <button
            onClick={() => setTab("reports")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === "reports" ? "bg-teal-500 text-brand-950" : "text-foreground-muted"}`}
          >
            Reports
          </button>
          <button
            onClick={() => setTab("audit")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === "audit" ? "bg-teal-500 text-brand-950" : "text-foreground-muted"}`}
          >
            Audit Log
          </button>
        </div>
        {tab === "reports" && (
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
      </div>

      {tab === "reports" ? (
        isLoading || !data ? (
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
                <Stat label="Voided tables" value={String(data.voidRefund.voidedCount)} />
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
        )
      ) : (
        <div className="space-y-1">
          {auditLog?.map((entry) => (
            <Card key={entry.id} className="text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {entry.action.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-foreground-muted">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-foreground-muted">
                {entry.staff?.name ?? "System"} · {entry.entityType}
                {entry.reason ? ` · ${entry.reason}` : ""}
              </p>
            </Card>
          ))}
          {auditLog?.length === 0 && (
            <p className="text-sm text-foreground-muted">No audit entries yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
