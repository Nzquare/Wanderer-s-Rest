"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isShiftStale, SHIFT_STALE_HOURS } from "@/lib/shift";

export function ShiftPanel() {
  const utils = trpc.useUtils();
  const { data: shift, isLoading } = trpc.shifts.getCurrent.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const [startingCash, setStartingCash] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [closeResult, setCloseResult] = useState<{
    expectedCash: number;
    actualCashCounted: number | null;
    cashDifference: number | null;
  } | null>(null);
  // Force-close (§Automatic shift close) is a separate, deliberately
  // harder-to-reach flow — hidden behind its own toggle rather than
  // sitting next to the normal Close Shift button, so it's never the
  // easy/obvious choice over actually counting the drawer.
  const [showForceClose, setShowForceClose] = useState(false);
  const [forceCloseReason, setForceCloseReason] = useState("");

  const open = trpc.shifts.open.useMutation({
    onSuccess: async () => {
      setStartingCash("");
      await utils.shifts.getCurrent.invalidate();
    },
  });
  const close = trpc.shifts.close.useMutation({
    onSuccess: async (data) => {
      setCloseResult(data);
      setActualCash("");
      await utils.shifts.getCurrent.invalidate();
    },
  });
  const forceClose = trpc.shifts.forceClose.useMutation({
    onSuccess: async (data) => {
      setCloseResult({
        expectedCash: data.expectedCash,
        actualCashCounted: null,
        cashDifference: null,
      });
      setShowForceClose(false);
      setForceCloseReason("");
      await utils.shifts.getCurrent.invalidate();
    },
  });

  if (isLoading) return <p className="text-sm text-foreground-muted">Loading…</p>;

  if (closeResult) {
    return (
      <Card className="space-y-2">
        <p className="text-lg font-semibold text-foreground">Shift closed</p>
        <div className="flex justify-between text-sm">
          <span>Expected cash</span>
          <span>฿{closeResult.expectedCash.toFixed(0)}</span>
        </div>
        {closeResult.actualCashCounted != null && closeResult.cashDifference != null ? (
          <>
            <div className="flex justify-between text-sm">
              <span>Actual cash counted</span>
              <span>฿{closeResult.actualCashCounted.toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span>Difference</span>
              <span
                className={
                  closeResult.cashDifference === 0
                    ? "text-status-success"
                    : "text-status-warning"
                }
              >
                {closeResult.cashDifference >= 0 ? "+" : ""}
                ฿{closeResult.cashDifference.toFixed(0)}
              </span>
            </div>
          </>
        ) : (
          // Force-closed (§Automatic shift close) — no physical count
          // happened, so there's nothing to compare expected cash
          // against. Said plainly rather than showing a difference of
          // ฿0, which would misleadingly read as "counted and matched."
          <p className="text-sm text-status-warning">
            Force-closed without a cash count — reconcile the drawer
            separately if needed.
          </p>
        )}
        <Button className="w-full" onClick={() => setCloseResult(null)}>
          Open a new shift
        </Button>
      </Card>
    );
  }

  if (!shift) {
    return (
      <Card className="space-y-3">
        <p className="text-sm font-medium text-foreground-muted">
          No shift is open. Count the starting cash drawer and open one.
        </p>
        <input
          type="number"
          value={startingCash}
          onChange={(e) => setStartingCash(e.target.value)}
          placeholder="Starting cash (฿)"
          className="h-12 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
        {open.error && <p className="text-sm text-status-danger">{open.error.message}</p>}
        <Button
          size="xl"
          className="w-full"
          disabled={!startingCash || open.isPending}
          onClick={() => open.mutate({ startingCash: Number(startingCash) })}
        >
          Open Shift
        </Button>
      </Card>
    );
  }

  const stale = isShiftStale(shift.openedAt);

  return (
    <div className="space-y-4">
      {/* Nudge, not an auto-close (§Automatic shift close) — a shift left
          open this long almost certainly wasn't left open on purpose, but
          closing it for real still needs someone to actually count the
          drawer. Force close below is the escape hatch for when whoever
          had it open is genuinely gone. */}
      {stale && (
        <Card className="border-status-warning/40 bg-status-warning/10">
          <p className="text-sm font-medium text-status-warning">
            ⚠ This shift has been open more than {SHIFT_STALE_HOURS} hours — opened by{" "}
            {shift.openedByName} on {new Date(shift.openedAt).toLocaleString()}. If
            they&apos;re not around to close it properly, use Force close below.
          </p>
        </Card>
      )}
      <Card className="space-y-2">
        <p className="text-sm font-medium text-foreground-muted">
          Shift opened by {shift.openedByName} at{" "}
          {new Date(shift.openedAt).toLocaleTimeString()}
        </p>
        <div className="flex justify-between text-sm">
          <span>Starting cash</span>
          <span>฿{shift.startingCash.toFixed(0)}</span>
        </div>
        {/* Whichever payment methods actually got used this shift
            (§Payment methods — manage your own) — not a fixed
            Cash/PromptPay/Card/Other set, since a café can take payment
            through its own custom methods (Line Man, Grab, ...) too. */}
        {shift.byMethod.map((m) => (
          <div key={m.methodId ?? m.name} className="flex justify-between text-sm">
            <span>{m.name}</span>
            <span>฿{m.total.toFixed(0)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
          <span>Total sales ({shift.paymentCount} payments)</span>
          <span>฿{shift.totalSales.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-sm text-foreground-muted">
          <span>Expected cash in drawer</span>
          <span>฿{shift.expectedCash.toFixed(0)}</span>
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="text-sm font-medium text-foreground-muted">Close shift</p>
        <input
          type="number"
          value={actualCash}
          onChange={(e) => setActualCash(e.target.value)}
          placeholder="Actual cash counted (฿)"
          className="h-12 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
        {close.error && <p className="text-sm text-status-danger">{close.error.message}</p>}
        <Button
          size="xl"
          variant="brand"
          className="w-full"
          disabled={!actualCash || close.isPending}
          onClick={() =>
            close.mutate({ shiftId: shift.id, actualCashCounted: Number(actualCash) })
          }
        >
          Close Shift
        </Button>
      </Card>

      {/* Force close (§Automatic shift close) — kept separate from, and
          visually quieter than, the normal Close Shift button above so
          it's never the easy default over actually counting the drawer.
          Only for an abandoned shift blocking a new one from opening. */}
      {showForceClose ? (
        <Card className="space-y-3">
          <p className="text-sm font-medium text-status-warning">
            Force close without a cash count
          </p>
          <p className="text-xs text-foreground-muted">
            Only for a shift nobody&apos;s around to close properly — this skips the
            cash count entirely, so reconcile the drawer separately afterward if
            you need to.
          </p>
          <input
            value={forceCloseReason}
            onChange={(e) => setForceCloseReason(e.target.value)}
            placeholder="Reason (e.g. staff left without closing out)"
            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
          />
          {forceClose.error && (
            <p className="text-sm text-status-danger">{forceClose.error.message}</p>
          )}
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              disabled={!forceCloseReason.trim() || forceClose.isPending}
              onClick={() =>
                forceClose.mutate({ shiftId: shift.id, reason: forceCloseReason.trim() })
              }
            >
              Force close
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => {
                setShowForceClose(false);
                setForceCloseReason("");
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <button
          onClick={() => setShowForceClose(true)}
          className="text-xs text-foreground-muted underline"
        >
          Shift abandoned? Force close without a cash count
        </button>
      )}
    </div>
  );
}
