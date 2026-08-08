"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableStatusBadge } from "@/components/ui/status-badge";
import { LiveTimer } from "./live-timer";
import { OpenTableForm } from "./open-table-form";
import { MemberLinkPanel } from "./member-link-panel";
import { OrderPanel } from "./order-panel";
import { OrderList } from "./order-list";
import { cn } from "@/lib/cn";

type PlayerStatus = "ACTIVE" | "PAUSED" | "STOPPED";

function PlayerRow({
  player,
  tableId,
}: {
  player: {
    id: string;
    label: string | null;
    status: PlayerStatus;
    startTime: string;
    pausedAt: string | null;
    accumulatedPausedMs: number;
    endTime: string | null;
  };
  tableId: string;
}) {
  const utils = trpc.useUtils();
  const invalidate = () =>
    Promise.all([
      utils.sessions.getTableDetail.invalidate({ tableId }),
      utils.sessions.listTables.invalidate(),
    ]);
  const pause = trpc.sessions.pausePlayer.useMutation({ onSuccess: invalidate });
  const resume = trpc.sessions.resumePlayer.useMutation({ onSuccess: invalidate });
  const stop = trpc.sessions.stopPlayer.useMutation({ onSuccess: invalidate });
  const restart = trpc.sessions.restartPlayer.useMutation({ onSuccess: invalidate });
  const pending =
    pause.isPending || resume.isPending || stop.isPending || restart.isPending;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            player.status === "ACTIVE" && "bg-status-active",
            player.status === "PAUSED" && "bg-status-warning",
            player.status === "STOPPED" && "bg-status-neutral",
          )}
        />
        <div>
          <p className="text-sm font-medium text-foreground">
            {player.label ?? "Player"}
          </p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            <LiveTimer timer={player} />
          </p>
        </div>
      </div>
      <div className="flex gap-1.5">
        {player.status === "ACTIVE" && (
          <>
            <Button
              size="md"
              variant="outline"
              disabled={pending}
              onClick={() => pause.mutate({ sessionPlayerId: player.id })}
            >
              Pause
            </Button>
            <Button
              size="md"
              variant="outline"
              disabled={pending}
              onClick={() => stop.mutate({ sessionPlayerId: player.id })}
            >
              Stop
            </Button>
          </>
        )}
        {player.status === "PAUSED" && (
          <>
            <Button
              size="md"
              variant="primary"
              disabled={pending}
              onClick={() => resume.mutate({ sessionPlayerId: player.id })}
            >
              Resume
            </Button>
            <Button
              size="md"
              variant="outline"
              disabled={pending}
              onClick={() => stop.mutate({ sessionPlayerId: player.id })}
            >
              Stop
            </Button>
          </>
        )}
        {player.status === "STOPPED" && (
          <Button
            size="md"
            variant="outline"
            disabled={pending}
            onClick={() => restart.mutate({ sessionPlayerId: player.id })}
          >
            Restart
          </Button>
        )}
      </div>
    </div>
  );
}

export function TableDetail({
  tableId,
  basePath,
}: {
  tableId: string;
  basePath: "/cashier" | "/staff";
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.sessions.getTableDetail.useQuery(
    { tableId },
    { refetchInterval: 15_000 },
  );
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  const invalidate = () =>
    Promise.all([
      utils.sessions.getTableDetail.invalidate({ tableId }),
      utils.sessions.listTables.invalidate(),
    ]);

  const addPlayer = trpc.sessions.addPlayer.useMutation({ onSuccess: invalidate });
  const pauseTable = trpc.sessions.pauseTable.useMutation({ onSuccess: invalidate });
  const resumeTable = trpc.sessions.resumeTable.useMutation({ onSuccess: invalidate });
  const markReady = trpc.sessions.markReadyForCheckout.useMutation({
    onSuccess: invalidate,
  });
  const updateNotes = trpc.sessions.updateNotes.useMutation({
    onSuccess: invalidate,
  });

  if (isLoading || !data) {
    return <p className="text-sm text-foreground-muted">Loading table…</p>;
  }

  const { table, session, grandTotal } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push(basePath)}
            className="text-sm text-teal-600"
          >
            ← All tables
          </button>
          <h1 className="text-2xl font-semibold text-foreground">
            {table.name}
          </h1>
        </div>
        <TableStatusBadge status={table.status} />
      </div>

      {!session ? (
        <OpenTableForm tableId={tableId} onOpened={invalidate} />
      ) : (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-foreground-muted">Current bill</p>
              <p className="text-3xl font-semibold text-foreground">
                ฿{grandTotal.toFixed(0)}
              </p>
            </div>
            <div className="flex gap-2">
              {session.status === "OPEN" && (
                <Button
                  variant="outline"
                  onClick={() => pauseTable.mutate({ sessionId: session.id })}
                  disabled={pauseTable.isPending}
                >
                  Pause Table
                </Button>
              )}
              {session.status === "PAUSED" && (
                <Button
                  variant="primary"
                  onClick={() => resumeTable.mutate({ sessionId: session.id })}
                  disabled={resumeTable.isPending}
                >
                  Resume Table
                </Button>
              )}
              {session.status !== "READY_FOR_CHECKOUT" &&
                session.status !== "CHECKOUT_IN_PROGRESS" && (
                  <Button
                    variant="brand"
                    onClick={() => markReady.mutate({ sessionId: session.id })}
                    disabled={markReady.isPending}
                  >
                    Send to Checkout
                  </Button>
                )}
              {basePath === "/cashier" &&
                session.status === "READY_FOR_CHECKOUT" && (
                  <Button variant="primary" disabled title="Checkout screen lands next build pass">
                    Checkout →
                  </Button>
                )}
            </div>
          </Card>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground-muted">
                Players ({session.players.length})
              </p>
              <Button
                size="md"
                variant="outline"
                onClick={() => addPlayer.mutate({ sessionId: session.id })}
                disabled={addPlayer.isPending}
              >
                + Add Player
              </Button>
            </div>
            {session.players.map((p) => (
              <PlayerRow
                key={p.id}
                tableId={tableId}
                player={{
                  id: p.id,
                  label: p.label,
                  status: p.status,
                  startTime: String(p.startTime),
                  pausedAt: p.pausedAt ? String(p.pausedAt) : null,
                  accumulatedPausedMs: Number(p.accumulatedPausedMs),
                  endTime: p.endTime ? String(p.endTime) : null,
                }}
              />
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground-muted">
              Orders
            </p>
            <OrderList
              orders={session.orders.map((o) => ({
                id: o.id,
                source: o.source,
                createdAt: String(o.createdAt),
                items: o.items.map((i) => ({
                  id: i.id,
                  nameSnapshotEn: i.nameSnapshotEn,
                  quantity: i.quantity,
                  unitPriceSnapshot: i.unitPriceSnapshot,
                  modifiers: i.modifiers.map((m) => ({
                    id: m.id,
                    nameSnapshotEn: m.nameSnapshotEn,
                  })),
                })),
              }))}
            />
          </div>

          <OrderPanel
            sessionId={session.id}
            tableId={tableId}
            source={basePath === "/cashier" ? "CASHIER" : "STAFF"}
          />

          <MemberLinkPanel
            sessionId={session.id}
            tableId={tableId}
            member={session.member}
          />

          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground-muted">
              Table notes
            </p>
            <textarea
              defaultValue={session.notes ?? ""}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => {
                if (notesDraft !== null) {
                  updateNotes.mutate({ sessionId: session.id, notes: notesDraft });
                }
              }}
              rows={2}
              className="w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-teal-500"
              placeholder="Optional notes for this table…"
            />
          </div>
        </div>
      )}
    </div>
  );
}
