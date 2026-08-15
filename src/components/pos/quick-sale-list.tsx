"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TableStatusBadge } from "@/components/ui/status-badge";
import { LiveTimer } from "./live-timer";

const KIND_LABELS: Record<"WALK_IN" | "DELIVERY" | "SPLIT", string> = {
  WALK_IN: "Walk-in",
  DELIVERY: "Delivery",
  SPLIT: "Split bill",
};

const KIND_BADGE_CLS: Record<"WALK_IN" | "DELIVERY" | "SPLIT", string> = {
  WALK_IN: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  DELIVERY: "bg-brand-500/15 text-brand-700 dark:text-brand-300",
  SPLIT: "bg-status-warning/15 text-status-warning",
};

/**
 * Quick Sale — the tab for tables that aren't on the physical floor plan
 * (§Quick Sale): walk-in counter sales, delivery orders, and bills split
 * off of a real table. Same card shape as the floor-plan TableGrid (still
 * a table+session under the hood) plus a kind badge and a "+ New" starter
 * for walk-in/delivery. Splitting a real table's bill starts from that
 * table's own page instead — see the "Split bill" action on TableDetail.
 */
export function QuickSaleList({ basePath }: { basePath: "/cashier" | "/staff" }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: tables, isLoading } = trpc.sessions.listQuickSaleTables.useQuery(
    undefined,
    { refetchInterval: 10_000 },
  );
  const [newOpen, setNewOpen] = useState(false);
  const createQuickSale = trpc.tables.createQuickSale.useMutation({
    onSuccess: async (table) => {
      await utils.sessions.listQuickSaleTables.invalidate();
      setNewOpen(false);
      router.push(`${basePath}/tables/${table.id}`);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Quick Sale</h1>
        <Button onClick={() => setNewOpen(true)}>+ New</Button>
      </div>
      <p className="text-sm text-foreground-muted">
        Walk-in counter sales, delivery orders, and bills split off a table —
        none of these sit on the floor plan.
      </p>

      {isLoading ? (
        <p className="text-sm text-foreground-muted">Loading…</p>
      ) : !tables || tables.length === 0 ? (
        <Card>
          <p className="text-sm text-foreground-muted">
            Nothing open right now — tap + New to start a walk-in or delivery
            sale.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tables.map((table) => (
            <Card key={table.id} className="flex h-full flex-col gap-2">
              <Link
                href={`${basePath}/tables/${table.id}`}
                className="flex flex-1 flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-semibold text-foreground">
                    {table.code}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${KIND_BADGE_CLS[table.kind as "WALK_IN" | "DELIVERY" | "SPLIT"]}`}
                  >
                    {KIND_LABELS[table.kind as "WALK_IN" | "DELIVERY" | "SPLIT"]}
                  </span>
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
                  <>
                    <TableStatusBadge status={table.status} />
                    <p className="text-sm text-foreground-muted">Not started yet</p>
                  </>
                )}
              </Link>
            </Card>
          ))}
        </div>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)}>
        <div className="space-y-3">
          <p className="text-base font-semibold text-foreground">New Quick Sale</p>
          <p className="text-sm text-foreground-muted">
            Not tied to a table — pick the type, then start it like any
            table (players, pricing, orders).
          </p>
          {createQuickSale.error && (
            <p className="text-sm text-status-danger">{createQuickSale.error.message}</p>
          )}
          <div className="flex flex-col gap-2">
            <Button
              size="xl"
              disabled={createQuickSale.isPending}
              onClick={() => createQuickSale.mutate({ kind: "WALK_IN" })}
            >
              Walk-in counter sale
            </Button>
            <Button
              size="xl"
              variant="outline"
              disabled={createQuickSale.isPending}
              onClick={() => createQuickSale.mutate({ kind: "DELIVERY" })}
            >
              Delivery order
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
