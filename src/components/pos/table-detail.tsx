"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableStatusBadge } from "@/components/ui/status-badge";
import { StaffAssignSelect } from "@/components/ui/staff-assign-select";
import { QrCodeImage } from "@/components/back-office/qr-code-image";
import { LiveTimer, formatMinutesShort } from "./live-timer";
import { OpenTableForm } from "./open-table-form";
import { MemberLinkPanel } from "./member-link-panel";
import { OrderPanel } from "./order-panel";
import { printOnce } from "@/lib/print-once";
import { OrderList } from "./order-list";
import { GameLogPanel } from "./game-log-panel";
import { SplitBillModal } from "./split-bill-modal";
import { StartPlayingPanel } from "./start-playing-panel";
import { PromotionPicker } from "./promotion-picker";
import { cn } from "@/lib/cn";

type PlayerStatus = "ACTIVE" | "PAUSED" | "STOPPED";

function PlayerRow({
  player,
  tableId,
  locked,
  notStarted,
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
  locked: boolean;
  /** Table hasn't started playing yet (§Start Playing) — every player
   * sits PAUSED at zero elapsed until a price is picked, so the usual
   * per-player Resume/Pause controls are hidden here (resumePlayer
   * rejects it anyway) in favor of the one table-level Start Playing
   * action, which resumes everyone together. */
  notStarted: boolean;
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
        {player.status === "PAUSED" && notStarted && (
          <span className="text-xs text-foreground-muted">Waiting to start</span>
        )}
        {player.status === "PAUSED" && !notStarted && (
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
        {player.status === "STOPPED" && !locked && (
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

/**
 * Applied promotions for this table, shown on the table page itself — not
 * just at Checkout (§Table-page promotions: a discount, especially a
 * member's own earned reward, is often decided before the bill is even
 * sent to checkout). Only rendered for basePath "/cashier" below —
 * applying/removing a promotion needs APPLY_DISCOUNTS, which Staff Mobile
 * roles (GM, Tavern Keeper) don't generally carry, same reasoning as the
 * "Checkout →" button being cashier-only.
 */
function PromotionsSection({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();
  const { data: appliedDiscounts } = trpc.checkout.listAppliedDiscounts.useQuery({ sessionId });
  const removeDiscount = trpc.checkout.removeDiscount.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.checkout.listAppliedDiscounts.invalidate({ sessionId }),
        utils.checkout.listEligiblePromotions.invalidate({ sessionId }),
      ]),
  });

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground-muted">Promotions</p>
        <PromotionPicker sessionId={sessionId} />
      </div>
      {appliedDiscounts && appliedDiscounts.length > 0 && (
        <div className="space-y-1">
          {/* Free item redemptions and EXP bonuses (§Award EXP as
              promotion) aren't a discount — no ฿ figure, just what got
              redeemed/granted and a way to undo it (see checkout-client's
              matching treatment on the Checkout screen). */}
          {appliedDiscounts
            .filter((d) => d.isFreeItem)
            .map((d) => (
              <div key={d.id} className="flex justify-between text-xs text-teal-600">
                <span>🎁 {d.label}</span>
                <button
                  onClick={() => removeDiscount.mutate({ discountId: d.id })}
                  className="underline"
                >
                  remove
                </button>
              </div>
            ))}
          {appliedDiscounts
            .filter((d) => d.isExpBonus)
            .map((d) => (
              <div key={d.id} className="flex justify-between text-xs text-teal-600">
                <span>⭐ {d.label}</span>
                <button
                  onClick={() => removeDiscount.mutate({ discountId: d.id })}
                  className="underline"
                >
                  remove
                </button>
              </div>
            ))}
          {appliedDiscounts
            .filter((d) => !d.isFreeItem && !d.isExpBonus)
            .map((d) => (
              <div key={d.id} className="flex justify-between text-sm text-status-danger">
                <span>{d.label}</span>
                <div className="flex items-center gap-2">
                  <span>-฿{d.amount.toFixed(0)}</span>
                  {/* The rank discount (§Rank discount) isn't a real
                      AppliedDiscount row — it's computed automatically
                      from the member's current rank, so there's nothing
                      here to remove. */}
                  {!d.isRankDiscount && (
                    <button
                      onClick={() => removeDiscount.mutate({ discountId: d.id })}
                      className="text-xs underline"
                    >
                      remove
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
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
  const { data: cafeSettings } = trpc.settings.getCafe.useQuery();
  // Same fallback as receipt-view.tsx/checkout-client.tsx — matches what
  // this setting already defaults to (§Receipt settings wiring).
  const cafeName = cafeSettings?.nameEn ?? "Wanderer's Rest";
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  // Only read on the client; the print area that uses this is hidden until
  // printed (@media print), so there's nothing to mismatch during hydration.
  const [origin] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : "",
  );
  // Gates #table-qr-print-area — this page also hosts OrderPanel's own
  // kitchen-ticket print area, so the QR slip can no longer just be
  // unconditionally `print:block`; that left it stuck showing on every
  // print job on the page (§printer overlap bug). See printOnce.
  const [showQrPrint, setShowQrPrint] = useState(false);

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
  const backToTable = trpc.sessions.backToTable.useMutation({
    onSuccess: invalidate,
  });
  const updateNotes = trpc.sessions.updateNotes.useMutation({
    onSuccess: invalidate,
  });
  // Collapsible so a table with many players (6-8) doesn't dominate the
  // left column — expanded by default since most tables are 1-2 players
  // and staff usually want the pause/stop controls visible at a glance.
  const [playersOpen, setPlayersOpen] = useState(true);
  // Staff Mobile only (§scroll to order) — the single-column layout stacks
  // bill/players/games/notes above the actual order-taking panel, so
  // reaching it meant scrolling past all of that first. Splits the page
  // into two local tabs there instead; the two-column Cashier layout
  // doesn't have this problem (ordering is already its own column) so it
  // ignores this entirely.
  const [staffTab, setStaffTab] = useState<"table" | "order">("table");
  const [splitOpen, setSplitOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidStaffId, setVoidStaffId] = useState("");
  const [voidPin, setVoidPin] = useState("");
  const voidSession = trpc.sessions.voidSession.useMutation({
    onSuccess: () => {
      setVoidOpen(false);
      setVoidReason("");
      setVoidStaffId("");
      setVoidPin("");
      router.push(basePath);
      utils.sessions.listTables.invalidate();
    },
  });

  if (isLoading || !data) {
    return <p className="text-sm text-foreground-muted">Loading table…</p>;
  }

  const { table, session, grandTotal, liveBill, foodDrinkSubtotal } = data;
  // Sent to checkout — the bill is meant to be locked (no new players, no
  // new orders, no timer restarts) until Back to Table explicitly reopens
  // it. See sessions.backToTable / sessions.ts's OPEN_ORDER_STATUSES.
  const locked = session?.status === "READY_FOR_CHECKOUT";
  // Seated but never started playing (§Start Playing) — opened with
  // OpenTableForm's "No play yet", or every player still sits PAUSED at
  // zero elapsed with no pricing type chosen. Distinguishes this from a
  // genuine mid-game pause, which always already has a pricing type.
  const notStarted = session?.status === "PAUSED" && !session.pricingType;

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
        <div className="flex items-center gap-2">
          {/* Doesn't depend on the table having an active session — a QR
              code identifies the table itself (§6), so it can be printed
              and placed before the table is ever opened. */}
          {table.qrEnabled && origin && (
            <Button
              size="md"
              variant="outline"
              onClick={() =>
                printOnce(
                  () => setShowQrPrint(true),
                  () => setShowQrPrint(false),
                )
              }
            >
              Print QR
            </Button>
          )}
          <TableStatusBadge status={table.status} />
        </div>
      </div>

      {/* Printed slip — hidden on screen, shown only by @media print, and
          only while showQrPrint is on (see printOnce above) — this page
          also hosts OrderPanel's own kitchen-ticket print area, so this
          can't just be unconditionally print:block anymore. */}
      {table.qrEnabled && origin && (
        <div
          id="table-qr-print-area"
          className={showQrPrint ? "print-area hidden print:block" : "hidden"}
        >
          <div className="mx-auto max-w-xs space-y-2 p-4 text-center font-mono text-sm">
            <p className="font-semibold">{cafeName}</p>
            <p className="text-xs">Table {table.code} — Scan to order</p>
            <div className="flex justify-center py-2">
              <QrCodeImage value={`${origin}/t/${table.qrToken}`} size={220} />
            </div>
          </div>
        </div>
      )}

      {!session ? (
        table.status === "AVAILABLE" || table.status === "RESERVED" ? (
          <OpenTableForm tableId={tableId} onOpened={invalidate} />
        ) : (
          <NotOpenablePanel table={table} onCleared={invalidate} />
        )
      ) : (
        (() => {
          // Cashier terminals are wide enough for a two-column layout —
          // table/bill/players/member on the left, orders on the right —
          // but Staff Mobile stays single-column since it targets phones.
          const twoColumn = basePath === "/cashier";

          const billCard = (
            <Card className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-foreground-muted">Current bill</p>
                <p className="text-3xl font-semibold text-foreground">
                  ฿{grandTotal.toFixed(0)}
                </p>
                {notStarted ? (
                  <p className="mt-1 text-xs text-foreground-muted">
                    {session.players.length} player{session.players.length === 1 ? "" : "s"} seated ·
                    not playing yet · Order ฿{foodDrinkSubtotal.toFixed(0)}
                  </p>
                ) : (
                  liveBill && (() => {
                  // Once every fee line has hit the daily cap, the bill is
                  // pinned flat for the rest of the day just like FIXED/
                  // PACKAGE pricing — the elapsed-time readout stops meaning
                  // anything and should read "All day" too, not "3h 15m".
                  const allCapped =
                    liveBill.lines.length > 0 &&
                    liveBill.lines.every((l) => l.cappedAtDailyCap);
                  const isHourly = session.pricingType?.model === "HOURLY";
                  const showAllDay = !isHourly || allCapped;
                  return (
                    <>
                      <p className="mt-1 text-xs text-foreground-muted">
                        {session.players.length} player{session.players.length === 1 ? "" : "s"} ·{" "}
                        {showAllDay
                          ? "All day"
                          : `${formatMinutesShort(Math.max(0, ...liveBill.lines.map((l) => l.billableMinutes)))} played`}{" "}
                        · Playtime ฿{liveBill.total.toFixed(0)} · Order ฿
                        {foodDrinkSubtotal.toFixed(0)}
                      </p>
                      {isHourly && liveBill.lines.length > 1 && (
                        <p className="mt-0.5 text-xs text-foreground-muted">
                          {liveBill.lines
                            .map((l, i) =>
                              `P${i + 1} ${l.cappedAtDailyCap ? "All day" : formatMinutesShort(l.billableMinutes)} (฿${l.fee.toFixed(0)})`,
                            )
                            .join(" · ")}
                        </p>
                      )}
                    </>
                  );
                  })()
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {session.status === "OPEN" && (
                  <Button
                    variant="outline"
                    onClick={() => pauseTable.mutate({ sessionId: session.id })}
                    disabled={pauseTable.isPending}
                  >
                    Pause Table
                  </Button>
                )}
                {session.status === "PAUSED" && !notStarted && (
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
                {session.status === "READY_FOR_CHECKOUT" && (
                  <Button
                    variant="outline"
                    onClick={() => backToTable.mutate({ sessionId: session.id })}
                    disabled={backToTable.isPending}
                  >
                    {backToTable.isPending ? "Reopening…" : "Back to Table"}
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
                {(session.status === "OPEN" || session.status === "PAUSED") && (
                  <Button variant="outline" onClick={() => setSplitOpen(true)}>
                    Split bill
                  </Button>
                )}
                <Button variant="danger" onClick={() => setVoidOpen((v) => !v)}>
                  Void Table
                </Button>
              </div>
            </Card>
          );

          const startPlayingPanel = notStarted && (
            <StartPlayingPanel sessionId={session.id} tableId={tableId} />
          );

          const voidPanel = voidOpen && (
            <Card className="space-y-2 border-status-danger">
              <p className="text-sm font-medium text-foreground">
                Void this table — this cancels it with no charge. Requires a
                reason, who it&apos;s assigned to, and that person&apos;s
                passcode to confirm.
              </p>
              <div className="flex flex-wrap gap-2">
                <StaffAssignSelect
                  value={voidStaffId}
                  onChange={setVoidStaffId}
                  className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
                />
                <input
                  type="password"
                  inputMode="numeric"
                  value={voidPin}
                  onChange={(e) => setVoidPin(e.target.value)}
                  placeholder="Passcode"
                  className="h-11 w-32 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-status-danger"
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
                  disabled={!voidReason.trim() || !voidStaffId || !voidPin || voidSession.isPending}
                  onClick={() =>
                    voidSession.mutate({
                      sessionId: session.id,
                      staffId: voidStaffId,
                      pin: voidPin,
                      reason: voidReason.trim(),
                    })
                  }
                >
                  {voidSession.isPending ? "Voiding…" : "Confirm Void"}
                </Button>
              </div>
            </Card>
          );

          const playersSection = (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setPlayersOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground-muted"
                >
                  <span
                    className={cn(
                      "inline-block transition-transform",
                      playersOpen ? "rotate-90" : "rotate-0",
                    )}
                  >
                    ▸
                  </span>
                  Players ({session.players.length})
                </button>
                {!locked && (
                  <Button
                    size="md"
                    variant="outline"
                    onClick={() => addPlayer.mutate({ sessionId: session.id })}
                    disabled={addPlayer.isPending}
                  >
                    + Add Player
                  </Button>
                )}
              </div>
              {playersOpen &&
                session.players.map((p) => (
                  <PlayerRow
                    key={p.id}
                    tableId={tableId}
                    locked={locked}
                    notStarted={notStarted}
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
          );

          const ordersSection = (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground-muted">
                Orders
              </p>
              <OrderList
                tableCode={table.code}
                orders={session.orders.map((o) => ({
                  id: o.id,
                  source: o.source,
                  createdAt: String(o.createdAt),
                  notes: o.notes,
                  staffName: o.orderedBy?.name ?? null,
                  items: o.items.map((i) => ({
                    id: i.id,
                    nameSnapshotEn: i.nameSnapshotEn,
                    quantity: i.quantity,
                    unitPriceSnapshot: i.unitPriceSnapshot,
                    notes: i.notes,
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
          );

          const addOrderSection = locked ? (
            <Card className="text-sm text-foreground-muted">
              Locked for checkout — no new orders until this table goes{" "}
              <button onClick={() => backToTable.mutate({ sessionId: session.id })} className="text-teal-600 underline">
                Back to Table
              </button>
              .
            </Card>
          ) : (
            <OrderPanel
              sessionId={session.id}
              tableId={tableId}
              tableCode={table.code}
              source={basePath === "/cashier" ? "CASHIER" : "STAFF"}
            />
          );

          const gameLogSection = <GameLogPanel sessionId={session.id} />;

          const memberSection = (
            <Card className="space-y-2">
              <p className="text-sm font-medium text-foreground-muted">Member</p>
              <MemberLinkPanel sessionId={session.id} member={session.member} onChanged={invalidate} />
            </Card>
          );

          // Cashier-only — see PromotionsSection's own comment.
          const promotionsSection = basePath === "/cashier" && (
            <PromotionsSection sessionId={session.id} />
          );

          const notesSection = (
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
          );

          const splitBillModal = (
            <SplitBillModal
              open={splitOpen}
              onClose={() => setSplitOpen(false)}
              sessionId={session.id}
              basePath={basePath}
              players={session.players.map((p) => ({
                id: p.id,
                label: p.label,
                status: p.status,
              }))}
              items={session.orders.flatMap((o) =>
                o.items.map((i) => ({
                  id: i.id,
                  nameSnapshotEn: i.nameSnapshotEn,
                  quantity: i.quantity,
                  unitPriceSnapshot: i.unitPriceSnapshot,
                })),
              )}
            />
          );

          if (twoColumn) {
            return (
              <>
                <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <div className="space-y-4">
                    {billCard}
                    {voidPanel}
                    {startPlayingPanel}
                    {memberSection}
                    {promotionsSection}
                    {playersSection}
                    {gameLogSection}
                    {notesSection}
                  </div>
                  <div className="space-y-4">
                    {ordersSection}
                    {addOrderSection}
                  </div>
                </div>
                {splitBillModal}
              </>
            );
          }

          return (
            <>
              <div className="flex gap-2 rounded-full border border-border bg-surface p-1">
                <button
                  onClick={() => setStaffTab("table")}
                  className={cn(
                    "flex-1 rounded-full py-2 text-sm font-medium",
                    staffTab === "table"
                      ? "bg-teal-500 text-brand-950"
                      : "text-foreground-muted",
                  )}
                >
                  Table
                </button>
                <button
                  onClick={() => setStaffTab("order")}
                  className={cn(
                    "flex-1 rounded-full py-2 text-sm font-medium",
                    staffTab === "order"
                      ? "bg-teal-500 text-brand-950"
                      : "text-foreground-muted",
                  )}
                >
                  Order
                </button>
              </div>
              <div className="mt-4 space-y-4">
                {staffTab === "table" ? (
                  <>
                    {billCard}
                    {voidPanel}
                    {startPlayingPanel}
                    {memberSection}
                    {promotionsSection}
                    {playersSection}
                    {gameLogSection}
                    {notesSection}
                  </>
                ) : (
                  <>
                    {ordersSection}
                    {addOrderSection}
                  </>
                )}
              </div>
              {splitBillModal}
            </>
          );
        })()
      )}
    </div>
  );
}
