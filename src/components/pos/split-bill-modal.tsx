"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toNum } from "@/lib/decimal";

type Player = { id: string; label: string | null; status: string };
type Item = { id: string; nameSnapshotEn: string; quantity: number; unitPriceSnapshot: unknown };

/**
 * "Split bill" on a real table's page (§Quick Sale) — a group wants
 * separate checks. Staff picks which players and/or how many of each
 * order item move to a brand-new Quick Sale table; everything left
 * unchecked stays on this table. Submits to sessions.splitOff, which
 * does the actual move in one transaction, then jumps straight to the
 * new table so staff can keep going (add more items, send to checkout).
 */
export function SplitBillModal({
  open,
  onClose,
  sessionId,
  basePath,
  players,
  items,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  basePath: "/cashier" | "/staff";
  players: Player[];
  items: Item[];
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [playerIds, setPlayerIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const splitOff = trpc.sessions.splitOff.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.sessions.getTableDetail.invalidate(),
        utils.sessions.listTables.invalidate(),
        utils.sessions.listQuickSaleTables.invalidate(),
      ]);
      onClose();
      router.push(`${basePath}/tables/${result.tableId}`);
    },
  });

  function reset() {
    setPlayerIds(new Set());
    setQuantities({});
  }

  const hasSelection = playerIds.size > 0 || Object.values(quantities).some((q) => q > 0);

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      wide
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-foreground">Split bill</p>
          <button onClick={onClose} className="text-sm text-foreground-muted">
            Close
          </button>
        </div>
        <p className="text-sm text-foreground-muted">
          Pick who and what moves to a new bill — a fresh Quick Sale table
          gets checked out separately. Anything left unchecked stays here.
        </p>

        {players.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground-muted">Players</p>
            <div className="flex flex-wrap gap-2">
              {players.map((p) => {
                const checked = playerIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      setPlayerIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                    className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                      checked
                        ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                        : "border-border text-foreground-muted"
                    }`}
                  >
                    {p.label ?? "Player"}
                    {p.status === "STOPPED" ? " (stopped)" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground-muted">Order items</p>
            <div className="space-y-2">
              {items.map((item) => {
                const qty = quantities[item.id] ?? 0;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{item.nameSnapshotEn}</p>
                      <p className="text-xs text-foreground-muted">
                        {item.quantity} on this bill · ฿{toNum(item.unitPriceSnapshot).toFixed(0)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="h-9 w-9 rounded-lg border border-border text-lg font-semibold active:bg-black/5"
                        disabled={qty <= 0}
                        onClick={() =>
                          setQuantities((q) => ({ ...q, [item.id]: Math.max(0, (q[item.id] ?? 0) - 1) }))
                        }
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
                      <button
                        className="h-9 w-9 rounded-lg border border-border text-lg font-semibold active:bg-black/5"
                        disabled={qty >= item.quantity}
                        onClick={() =>
                          setQuantities((q) => ({
                            ...q,
                            [item.id]: Math.min(item.quantity, (q[item.id] ?? 0) + 1),
                          }))
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {players.length === 0 && items.length === 0 && (
          <p className="text-sm text-foreground-muted">Nothing on this bill to split yet.</p>
        )}

        {splitOff.error && <p className="text-sm text-status-danger">{splitOff.error.message}</p>}

        <Button
          size="xl"
          className="w-full"
          disabled={!hasSelection || splitOff.isPending}
          onClick={() =>
            splitOff.mutate({
              sourceSessionId: sessionId,
              source: basePath === "/cashier" ? "CASHIER" : "STAFF",
              playerIds: Array.from(playerIds),
              itemMoves: Object.entries(quantities)
                .filter(([, q]) => q > 0)
                .map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
            })
          }
        >
          {splitOff.isPending ? "Splitting…" : "Create split bill"}
        </Button>
      </div>
    </Modal>
  );
}
