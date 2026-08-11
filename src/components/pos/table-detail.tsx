"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableStatusBadge } from "@/components/ui/status-badge";
import { StaffAssignSelect } from "@/components/ui/staff-assign-select";
import { LiveTimer } from "./live-timer";
import { OpenTableForm } from "./open-table-form";
import { MemberLinkPanel } from "./member-link-panel";
import { OrderPanel } from "./order-panel";
import { OrderList } from "./order-list";
import { GameLogPanel } from "./game-log-panel";
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

/**
 * Shown when a table has no active session but also isn't AVAILABLE or
 * RESERVED — i.e. it's stuck CLEANING (after a void, or after checkout on
 * a slow connection) or manually marked UNAVAILABLE. Opening a new
 * session is blocked in that state, so this is the only way back.
 */
function NotOpenablePanel({
  table,
  onCleared,
}: {
  table: { id: string; status: string; name: string };
  onCleared: () => void;
}) {
  const markAvailable = trpc.checkout.markTableAvailable.useMutation({
    onSuccess: onCleared,
  });
  return (
    <Card className="space-y-3">
      <p className="text-sm text-foreground-muted">
        {table.name} is currently{" "}
        <span className="font-medium text-foreground">
          {table.status === "CLEANING" ? "being cleaned" : table.status.toLowerCase()}
        </span>{" "}
        and can&apos;t be opened for a new session yet.
      </p>
      {table.status === "CLEANING" && (
        <Button
          disabled={markAvailable.isPending}
          onClick={() => markAvailable.mutate({ tableId: table.id })}
        >
          {markAvailable.isPending ? "Marking…" : "Mark Available"}
        </Button>
      )}
    </Card>
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
  const acknowledgeAllForTable = trpc.orders.acknowledgeAllForTable.useMutation({
    onSuccess: () => utils.orders.listUnacknowledged.invalidate(),
  });
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidStaffId, setVoidStaffId] = useState("");
  const voidSession = trpc.sessions.voidSession.useMutation({
    onSuccess: () => {
      setVoidOpen(false);
      setVoidReason("");
      setVoidStaffId("");
      router.push(basePath);
      utils.sessions.listTables.invalidate();
    },
  });

  // Opening a table's detail page counts as the cashier having seen its
  // orders — clears it from the alert banner (§17).
  useEffect(() => {
    if (basePath === "/cashier") {
      acknowledgeAllForTable.mutate({ tableId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, basePath]);

  if (isLoading || !data) {
    return <p className="text-sm text-foreground-muted">Loading table…</p>;
  }

  const { table, session, grandTotal, liveBill, foodDrinkSubtotal } = data;

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
        table.status === "AVAILABLE" || table.status === "RESERVED" ? (
          <OpenTableForm tableId={tableId} onOpened={invalidate} />
        ) : (
          <NotOpenablePanel table={table} onCleared={invalidate} />
        )
      ) : (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-foreground-muted">Current bill</p>
              <p className="text-3xl font-semibold text-foreground">
                ฿{grandTotal.toFixed(0)}
              </p>
              {liveBill && (
                <p className="mt-1 text-xs text-foreground-muted">
                  Play time fee ฿{liveBill.total.toFixed(0)} · Food/drink ฿
                  {foodDrinkSubtotal.toFixed(0)}
                </p>
              )}
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
                  <Button
                    variant="primary"
                    onClick={() => router.push(`/cashier/tables/${tableId}/checkout`)}
                  >
                    Checkout →
                  </Button>
                )}
              <Button variant="danger" onClick={() => setVoidOpen((v) => !v)}>
                Void Table
              </Button>
            </div>
          </Card>

          {voidOpen && (
            <Card className="space-y-2 border-status-danger">
              <p className="text-sm font-medium text-foreground">
                Void this table — this cancels it with no charge. Requires a
                reason and who it&apos;s assigned to.
              </p>
              <div className="flex flex-wrap gap-2">
                <StaffAssignSelect
                  value={voidStaffId}
                  onChange={setVoidStaffId}
                  className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
                />
                <input
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Reason (e.g. customer left, opened by mistake)"
                  className="h-11 flex-1 min-w-40 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-status-danger"
                />
              </div>
              {voidSession.error && (
                <p className="text-sm text-status-danger">{voidSession.error.message}</p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setVoidOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={!voidReason.trim() || !voidStaffId || voidSession.isPending}
                  onClick={() =>
                    voidSession.mutate({
                      sessionId: session.id,
                      staffId: voidStaffId,
                      reason: voidReason.trim(),
                    })
                  }
                >
                  {voidSession.isPending ? "Voiding…" : "Confirm Void"}
                </Button>
              </div>
            </Card>
          )}

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
                  comboSelections: i.comboSelections.map((cs) => ({
                    id: cs.id,
                    slotNameSnapshotEn: cs.slotNameSnapshotEn,
                    nameSnapshotEn: cs.nameSnapshotEn,
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

          <GameLogPanel sessionId={session.id} />

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
