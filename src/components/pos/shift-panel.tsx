"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ShiftPanel() {
  const utils = trpc.useUtils();
  const { data: shift, isLoading } = trpc.shifts.getCurrent.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const [startingCash, setStartingCash] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [closeResult, setCloseResult] = useState<{
    expectedCash: number;
    actualCashCounted: number;
    cashDifference: number;
  } | null>(null);

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

  if (isLoading) return <p className="text-sm text-foreground-muted">Loading…</p>;

  if (closeResult) {
    return (
      <Card className="space-y-2">
        <p className="text-lg font-semibold text-foreground">Shift closed</p>
        <div className="flex justify-between text-sm">
          <span>Expected cash</span>
          <span>฿{closeResult.expectedCash.toFixed(0)}</span>
        </div>
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

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <p className="text-sm font-medium text-foreground-muted">
          Shift opened by {shift.openedByName} at{" "}
          {new Date(shift.openedAt).toLocaleTimeString()}
        </p>
        <div className="flex justify-between text-sm">
          <span>Starting cash</span>
          <span>฿{shift.startingCash.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Cash sales</span>
          <span>฿{shift.byMethod.CASH.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>PromptPay</span>
          <span>฿{shift.byMethod.PROMPTPAY.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Card</span>
          <span>฿{shift.byMethod.CARD.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Other</span>
          <span>฿{shift.byMethod.OTHER.toFixed(0)}</span>
        </div>
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
    </div>
  );
}
