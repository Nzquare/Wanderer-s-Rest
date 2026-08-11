"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableStatusBadge } from "@/components/ui/status-badge";
import { LiveTimer } from "./live-timer";

export function TableGrid({ basePath }: { basePath: "/cashier" | "/staff" }) {
  const utils = trpc.useUtils();
  const { data: tables, isLoading } = trpc.sessions.listTables.useQuery(
    undefined,
    { refetchInterval: 10_000 },
  );
  const markAvailable = trpc.checkout.markTableAvailable.useMutation({
    onSuccess: () => utils.sessions.listTables.invalidate(),
  });

  if (isLoading) {
    return <p className="text-sm text-foreground-muted">Loading tables…</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tables?.map((table) => (
        <Card key={table.id} className="flex h-full flex-col gap-2">
          <Link href={`${basePath}/tables/${table.id}`} className="flex flex-1 flex-col gap-2">
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
                <p className="text-xs text-foreground-muted">
                  {table.session.allDay ? "All day" : "Playtime"} ฿
                  {table.session.tableFee.toFixed(0)} · Food/drink ฿
                  {table.session.foodDrinkSubtotal.toFixed(0)}
                </p>
              </>
            ) : (
              <p className="text-sm text-foreground-muted">
                {table.capacity} seats · {table.area ?? "—"}
              </p>
            )}
          </Link>
          {/* CLEANING has no active session to click into, so the reset
              button has to live right here — otherwise the table is a dead
              end with no way back to Available (§8: table lifecycle). */}
          {table.status === "CLEANING" && (
            <Button
              size="md"
              variant="outline"
              disabled={markAvailable.isPending}
              onClick={() => markAvailable.mutate({ tableId: table.id })}
            >
              Mark Available
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}
