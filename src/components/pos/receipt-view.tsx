"use client";

import { Button } from "@/components/ui/button";

interface ReceiptSnapshot {
  receiptNumber: string;
  table: { code: string; name: string };
  players: number;
  foodDrinkSubtotal: number;
  discounts: { label: string; amount: number }[];
  bill: {
    subtotalTableFee: number;
    subtotalFoodDrink: number;
    discountTotal: number;
    serviceChargeAmount: number;
    taxAmount: number;
    total: number;
  };
  payments: { method: string; amount: number }[];
  member: { adventurerName: string } | null;
  expAwarded: number;
  unlockedAchievements?: { nameEn: string }[];
  staff: string;
  closedAt: string;
}

export function ReceiptView({
  snapshot,
  progression,
  onDone,
}: {
  snapshot: ReceiptSnapshot;
  progression: {
    levelBefore: number;
    levelAfter: number;
    rankBefore: string;
    rankAfter: string;
  } | null;
  onDone: () => void;
}) {
  const leveledUp = progression && progression.levelAfter > progression.levelBefore;
  const rankedUp = progression && progression.rankAfter !== progression.rankBefore;

  return (
    <div className="space-y-4">
      {snapshot.member && (
        <div className="rounded-2xl border border-teal-500 bg-teal-500/10 p-5 text-center">
          <p className="text-sm font-medium text-teal-700 dark:text-teal-300">
            Quest Complete!
          </p>
          <p className="mt-1 text-3xl font-bold text-foreground">
            +{snapshot.expAwarded} EXP
          </p>
          {leveledUp && progression && (
            <p className="mt-2 text-sm font-medium text-foreground">
              Level Up! LV {progression.levelBefore} → LV {progression.levelAfter}
            </p>
          )}
          {rankedUp && progression && (
            <p className="mt-1 text-sm font-medium text-foreground">
              Rank Up: {progression.rankAfter}!
            </p>
          )}
          {snapshot.unlockedAchievements && snapshot.unlockedAchievements.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-teal-500/30 pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-teal-700 dark:text-teal-300">
                Achievement Unlocked
              </p>
              {snapshot.unlockedAchievements.map((a, i) => (
                <p key={i} className="font-semibold text-foreground">
                  {a.nameEn}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        id="receipt-print-area"
        className="mx-auto max-w-xs space-y-2 rounded-2xl border border-border bg-surface p-5 font-mono text-sm"
      >
        <div className="text-center">
          <p className="font-semibold">Wanderer&apos;s Rest</p>
          <p className="text-xs text-foreground-muted">
            Receipt #{snapshot.receiptNumber}
          </p>
          <p className="text-xs text-foreground-muted">
            {new Date(snapshot.closedAt).toLocaleString()}
          </p>
        </div>
        <div className="border-t border-dashed border-border pt-2">
          <p>
            Table {snapshot.table.code} · {snapshot.players} player(s)
          </p>
          <p className="text-xs text-foreground-muted">Staff: {snapshot.staff}</p>
          {snapshot.member && <p>Member: {snapshot.member.adventurerName}</p>}
        </div>
        <div className="border-t border-dashed border-border pt-2 space-y-1">
          <div className="flex justify-between">
            <span>Table time</span>
            <span>฿{snapshot.bill.subtotalTableFee.toFixed(0)}</span>
          </div>
          <div className="flex justify-between">
            <span>Food/drink</span>
            <span>฿{snapshot.bill.subtotalFoodDrink.toFixed(0)}</span>
          </div>
          {snapshot.discounts.map((d, i) => (
            <div key={i} className="flex justify-between text-status-danger">
              <span>{d.label}</span>
              <span>-฿{d.amount.toFixed(0)}</span>
            </div>
          ))}
          {snapshot.bill.serviceChargeAmount > 0 && (
            <div className="flex justify-between">
              <span>Service charge</span>
              <span>฿{snapshot.bill.serviceChargeAmount.toFixed(0)}</span>
            </div>
          )}
          {snapshot.bill.taxAmount > 0 && (
            <div className="flex justify-between">
              <span>Tax</span>
              <span>฿{snapshot.bill.taxAmount.toFixed(0)}</span>
            </div>
          )}
        </div>
        <div className="border-t border-dashed border-border pt-2 flex justify-between font-semibold">
          <span>Total</span>
          <span>฿{snapshot.bill.total.toFixed(0)}</span>
        </div>
        <div className="border-t border-dashed border-border pt-2 space-y-1">
          {snapshot.payments.map((p, i) => (
            <div key={i} className="flex justify-between">
              <span>{p.method}</span>
              <span>฿{p.amount.toFixed(0)}</span>
            </div>
          ))}
        </div>
        {snapshot.member && (
          <div className="border-t border-dashed border-border pt-2 text-center text-xs">
            EXP earned: +{snapshot.expAwarded}
          </div>
        )}
        <p className="pt-2 text-center text-xs text-foreground-muted">
          Thank you for visiting Wanderer&apos;s Rest!
        </p>
      </div>

      <div className="flex gap-2 print:hidden">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => window.print()}
        >
          Print Receipt
        </Button>
        <Button className="flex-1" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
