"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isShiftStale, SHIFT_STALE_HOURS } from "@/lib/shift";
import { openCashDrawer, printShiftSummary } from "@/lib/thermal-print";

type CategoryLine = { categoryId: string; categoryName: string; quantity: number; revenue: number };

interface ShiftSummaryData {
  openedAt: string | Date;
  closedAt: string | Date;
  openedByName: string;
  closedByName: string;
  startingCash: number;
  byMethod: { methodId: string | null; name: string; total: number }[];
  totalSales: number;
  expectedCash: number;
  actualCashCounted: number | null;
  cashDifference: number | null;
  playtimeRevenue: number;
  foodDrinkRevenue: number;
  discountsTotal: number;
  sessionsServed: number;
  ordersCount: number;
  byCategory: CategoryLine[];
}

export function ShiftPanel() {
  const utils = trpc.useUtils();
  const { data: shift, isLoading } = trpc.shifts.getCurrent.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const { data: checkoutSettings } = trpc.settings.getCheckout.useQuery();
  const { data: cafeSettings } = trpc.settings.getCafe.useQuery();
  const { data: me } = trpc.staff.me.useQuery();
  const cafeName = cafeSettings?.nameEn ?? "Wanderer's Rest";
  const [startingCash, setStartingCash] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [closeResult, setCloseResult] = useState<ShiftSummaryData | null>(null);
  // Mirrors checkout-client.tsx's printMode pattern (§Daily summary on
  // shift close) — a hidden-until-print area, armed only right when a
  // close actually happens, not from page load.
  const [showSummaryPrint, setShowSummaryPrint] = useState(false);
  // Force-close (§Automatic shift close) is a separate, deliberately
  // harder-to-reach flow — hidden behind its own toggle rather than
  // sitting next to the normal Close Shift button, so it's never the
  // easy/obvious choice over actually counting the drawer.
  const [showForceClose, setShowForceClose] = useState(false);
  const [forceCloseReason, setForceCloseReason] = useState("");

  const open = trpc.shifts.open.useMutation({
    onSuccess: async () => {
      setStartingCash("");
      // Pop the drawer for counting in the starting float (§automatic
      // cash drawer open) — silently a no-op without a print bridge
      // configured, same as every other network-printer feature.
      openCashDrawer(checkoutSettings);
      await utils.shifts.getCurrent.invalidate();
    },
  });
  // Auto-prints the shift's daily summary the moment it closes (§Daily
  // summary on shift close) — byMethod/totalSales/startingCash/openedAt
  // all come from the `shift` query already loaded on screen (the same
  // numbers staff were looking at right before closing), not refetched;
  // only the extra sales-mix fields (playtime/food/discounts/category/
  // orders) come from the mutation's own buildShiftSummary result.
  function finishClose(
    data: {
      expectedCash: number;
      actualCashCounted: number | null;
      cashDifference: number | null;
      sessionsServed: number;
      ordersCount: number;
      playtimeRevenue: number;
      foodDrinkRevenue: number;
      discountsTotal: number;
      byCategory: CategoryLine[];
    },
    source: typeof shift,
  ) {
    if (!source) return;
    const summary: ShiftSummaryData = {
      openedAt: source.openedAt,
      closedAt: new Date().toISOString(),
      openedByName: source.openedByName,
      closedByName: me?.name ?? "Staff",
      startingCash: source.startingCash,
      byMethod: source.byMethod,
      totalSales: source.totalSales,
      expectedCash: data.expectedCash,
      actualCashCounted: data.actualCashCounted,
      cashDifference: data.cashDifference,
      playtimeRevenue: data.playtimeRevenue,
      foodDrinkRevenue: data.foodDrinkRevenue,
      discountsTotal: data.discountsTotal,
      sessionsServed: data.sessionsServed,
      ordersCount: data.ordersCount,
      byCategory: data.byCategory,
    };
    setCloseResult(summary);
    // Deferred a tick — printOnce's flushSync (see print-once.ts) can't
    // run while React is still mid-commit for the setCloseResult above,
    // which this call sits right inside of (a mutation's onSuccess) —
    // without the defer, React throws "flushSync was called from inside
    // a lifecycle method" instead of actually arming the print area.
    setTimeout(() => {
      printShiftSummary(
        summary,
        { cafeName },
        checkoutSettings,
        () => setShowSummaryPrint(true),
        () => setShowSummaryPrint(false),
        () => {},
      );
    }, 0);
  }
  const close = trpc.shifts.close.useMutation({
    onSuccess: async (data) => {
      finishClose(data, shift);
      setActualCash("");
      // Same at close — but not on forceClose below, which is
      // specifically for when nobody's around to count the drawer at
      // all, so popping it open then would make no sense.
      openCashDrawer(checkoutSettings);
      await utils.shifts.getCurrent.invalidate();
    },
  });
  const forceClose = trpc.shifts.forceClose.useMutation({
    onSuccess: async (data) => {
      finishClose({ ...data, actualCashCounted: null, cashDifference: null }, shift);
      setShowForceClose(false);
      setForceCloseReason("");
      await utils.shifts.getCurrent.invalidate();
    },
  });

  if (isLoading) return <p className="text-sm text-foreground-muted">Loading…</p>;

  if (closeResult) {
    return (
      <>
        <Card className="space-y-2">
          <p className="text-lg font-semibold text-foreground">Shift closed</p>
          <p className="text-xs text-foreground-muted">
            {new Date(closeResult.openedAt).toLocaleString()} – {new Date(closeResult.closedAt).toLocaleString()}
          </p>
          <div className="space-y-1 border-t border-border pt-2">
            {closeResult.byMethod.map((m) => (
              <div key={m.methodId ?? m.name} className="flex justify-between text-sm">
                <span>{m.name}</span>
                <span>฿{m.total.toFixed(0)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-semibold">
              <span>Total sales</span>
              <span>฿{closeResult.totalSales.toFixed(0)}</span>
            </div>
          </div>
          <div className="space-y-1 border-t border-border pt-2">
            <div className="flex justify-between text-sm">
              <span>Playtime revenue</span>
              <span>฿{closeResult.playtimeRevenue.toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Food &amp; drink</span>
              <span>฿{closeResult.foodDrinkRevenue.toFixed(0)}</span>
            </div>
            {closeResult.discountsTotal > 0 && (
              <div className="flex justify-between text-sm text-foreground-muted">
                <span>Discounts given</span>
                <span>-฿{closeResult.discountsTotal.toFixed(0)}</span>
              </div>
            )}
          </div>
          <div className="space-y-1 border-t border-border pt-2">
            <div className="flex justify-between text-sm">
              <span>Tables served</span>
              <span>{closeResult.sessionsServed}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Orders</span>
              <span>{closeResult.ordersCount}</span>
            </div>
            {closeResult.byCategory.length > 0 && (
              <div className="space-y-0.5 pl-3">
                {closeResult.byCategory.map((c) => (
                  <div key={c.categoryId} className="flex justify-between text-xs text-foreground-muted">
                    <span>{c.categoryName}</span>
                    <span>฿{c.revenue.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1 border-t border-border pt-2">
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
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() =>
                printShiftSummary(
                  closeResult,
                  { cafeName },
                  checkoutSettings,
                  () => setShowSummaryPrint(true),
                  () => setShowSummaryPrint(false),
                  () => {},
                )
              }
            >
              Print summary
            </Button>
            <Button className="flex-1" onClick={() => setCloseResult(null)}>
              Open a new shift
            </Button>
          </div>
        </Card>

        {/* Printed Z-report slip — hidden on screen, shown only by
            @media print, same pattern as checkout-client.tsx's invoice
            print area. */}
        <div
          id="shift-summary-print-area"
          style={
            { "--receipt-print-width": `${checkoutSettings?.printerWidthMm ?? 80}mm` } as CSSProperties
          }
          className={showSummaryPrint ? "print-area hidden print:block" : "hidden"}
        >
          <div className="mx-auto max-w-xs space-y-2 p-4 font-mono text-sm">
            <div className="text-center">
              <p className="font-semibold">{cafeName}</p>
              <p className="text-xs">Shift Summary</p>
              <p className="text-xs">
                Opened {new Date(closeResult.openedAt).toLocaleString()} — {closeResult.openedByName}
              </p>
              <p className="text-xs">
                Closed {new Date(closeResult.closedAt).toLocaleString()} — {closeResult.closedByName}
              </p>
            </div>
            <div className="border-t border-dashed border-border pt-2 space-y-1">
              <div className="flex justify-between">
                <span>Starting cash</span>
                <span>฿{closeResult.startingCash.toFixed(0)}</span>
              </div>
              {closeResult.byMethod.map((m) => (
                <div key={m.methodId ?? m.name} className="flex justify-between">
                  <span>{m.name}</span>
                  <span>฿{m.total.toFixed(0)}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold">
                <span>Total sales</span>
                <span>฿{closeResult.totalSales.toFixed(0)}</span>
              </div>
            </div>
            <div className="border-t border-dashed border-border pt-2 space-y-1">
              <div className="flex justify-between">
                <span>Playtime revenue</span>
                <span>฿{closeResult.playtimeRevenue.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Food &amp; drink</span>
                <span>฿{closeResult.foodDrinkRevenue.toFixed(0)}</span>
              </div>
              {closeResult.discountsTotal > 0 && (
                <div className="flex justify-between">
                  <span>Discounts given</span>
                  <span>-฿{closeResult.discountsTotal.toFixed(0)}</span>
                </div>
              )}
            </div>
            <div className="border-t border-dashed border-border pt-2 space-y-1">
              <div className="flex justify-between">
                <span>Tables served</span>
                <span>{closeResult.sessionsServed}</span>
              </div>
              <div className="flex justify-between">
                <span>Orders</span>
                <span>{closeResult.ordersCount}</span>
              </div>
              {closeResult.byCategory.map((c) => (
                <div key={c.categoryId} className="flex justify-between pl-2 text-xs">
                  <span>{c.categoryName}</span>
                  <span>฿{c.revenue.toFixed(0)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-border pt-2 space-y-1">
              <div className="flex justify-between font-semibold">
                <span>Expected cash</span>
                <span>฿{closeResult.expectedCash.toFixed(0)}</span>
              </div>
              {closeResult.actualCashCounted != null && closeResult.cashDifference != null ? (
                <>
                  <div className="flex justify-between">
                    <span>Actual cash counted</span>
                    <span>฿{closeResult.actualCashCounted.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Difference</span>
                    <span>
                      {closeResult.cashDifference >= 0 ? "+" : ""}
                      ฿{closeResult.cashDifference.toFixed(0)}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-center text-xs">Force-closed — no cash count taken</p>
              )}
            </div>
          </div>
        </div>
      </>
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
