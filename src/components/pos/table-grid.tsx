"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/card";
import { TableStatusBadge } from "@/components/ui/status-badge";
import { LiveTimer } from "./live-timer";

export function TableGrid({ basePath }: { basePath: "/cashier" | "/staff" }) {
  const { data: tables, isLoading } = trpc.sessions.listTables.useQuery(
    undefined,
    { refetchInterval: 10_000 },
  );

  if (isLoading) {
    return <p className="text-sm text-foreground-muted">Loading tables…</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tables?.map((table) => (
        <Link key={table.id} href={`${basePath}/tables/${table.id}`}>
          <Card className="flex h-full flex-col gap-2 transition-transform active:scale-[0.98]">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-foreground">
                {table.code}
              </span>
              <TableStatusBadge status={table.status} />
            </div>

            {table.session ? (
              <>
                <div className="text-2xl font-semibold tabular-nums text-brand-700 dark:text-teal-400">
                  {table.session.mainTimer ? (
                    <LiveTimer timer={table.session.mainTimer} />
                  ) : (
                    "--:--:--"
                  )}
                </div>
                <p className="text-sm text-foreground-muted">
                  {table.session.activePlayers}/{table.session.playerCount}{" "}
                  players
                  {table.session.member
                    ? ` · ${table.session.member.adventurerName}`
                    : ""}
                </p>
                <p className="text-sm font-medium text-foreground">
                  ฿{table.session.currentBill.toFixed(0)} current bill
                </p>
              </>
            ) : (
              <p className="text-sm text-foreground-muted">
                {table.capacity} seats · {table.area ?? "—"}
              </p>
            )}
          </Card>
        </Link>
      ))}
    </div>
  );
}
