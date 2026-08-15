"use client";

import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { formatMinutesShort } from "./live-timer";

interface ReceiptSnapshot {
  receiptNumber: string;
  table: { code: string; name: string };
  players: number;
  // Older receipts (printed before this field existed) won't have these —
  // always optional-chain/fallback rather than assuming they're present.
  tableFeeLines?: { playerId: string; billableMinutes: number; fee: number; cappedAtDailyCap?: boolean }[];
  // Older receipts (printed before this field existed) default to HOURLY so
  // they keep rendering their per-player minutes breakdown as before.
  pricingModel?: string;
  foodDrinkItems?: { id: string; nameEn: string; quantity: number; lineTotal: number }[];
  foodDrinkSubtotal: number;
  // Receipts printed before this field existed only have the flat
  // foodDrinkItems list above, lumped under one "Food/drink" heading —
  // fall back to that rendering when itemsByCategory is missing so old
  // receipts still render (§45: never re-derive a stored snapshot).
  itemsByCategory?: {
    categoryId: string;
    categoryName: string;
    subtotal: number;
    items: { id: string; nameEn: string; quantity: number; lineTotal: number }[];
  }[];
  // isFreeItem is absent on receipts printed before this field existed —
  // falls back to falsy, same as any other pre-existing snapshot field.
  discounts: { label: string; amount: number; isFreeItem?: boolean }[];
  bill: {
    subtotalTableFee: number;
    subtotalFoodDrink: number;
    discountTotal: number;
    serviceChargeAmount: number;
    taxAmount: number;
    total: number;
  };
  payments: { method: string; amount: number }[];
  // memberCode/classNameEn/classIcon are absent on receipts printed before
  // this field existed — fall back to omitting that line, same as any
  // other pre-existing snapshot field.
  member: {
    adventurerName: string;
    memberCode?: string;
    classNameEn?: string | null;
    classIcon?: string | null;
  } | null;
  expAwarded: number;
  // Also absent on older receipts — the "Quest Complete" banner's total
  // EXP/level/rank line just doesn't render for those.
  lifetimeExpAfter?: number | null;
  levelAfter?: number | null;
  rankNameAfter?: string | null;
  rankIconAfter?: string | null;
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

  const { data: checkoutSettings } = trpc.settings.getCheckout.useQuery();
  const printerWidthMm = checkoutSettings?.printerWidthMm ?? 80;

  // Once every fee line hit the daily cap, the bill was pinned flat for the
  // rest of the day just like FIXED/PACKAGE pricing — show "All day"
  // instead of a duration that no longer means anything (mirrors the live
  // checkout bill, §7).
  const isHourly = (snapshot.pricingModel ?? "HOURLY") === "HOURLY";
  const allCapped =
    !!snapshot.tableFeeLines &&
    snapshot.tableFeeLines.length > 0 &&
    snapshot.tableFeeLines.every((l) => l.cappedAtDailyCap);
  const showAllDay = !isHourly || allCapped;

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
          {snapshot.lifetimeExpAfter != null && snapshot.levelAfter != null && (
            <p className="mt-1 text-sm text-foreground-muted">
              Total {snapshot.lifetimeExpAfter} EXP · Level {snapshot.levelAfter}
              {snapshot.rankNameAfter &&
                ` · ${snapshot.rankIconAfter ?? "🎖️"} ${snapshot.rankNameAfter}`}
            </p>
          )}
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
        style={{ "--receipt-print-width": `${printerWidthMm}mm` } as CSSProperties}
        className={
          printerWidthMm === 58
            ? "mx-auto max-w-[240px] space-y-2 rounded-2xl border border-border bg-surface p-4 font-mono text-xs"
            : "mx-auto max-w-xs space-y-2 rounded-2xl border border-border bg-surface p-5 font-mono text-sm"
        }
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
          {snapshot.member && (
            <>
              <p>Member: {snapshot.member.adventurerName}</p>
              {snapshot.member.classNameEn && (
                <p className="text-xs text-foreground-muted">
                  Class: {snapshot.member.classIcon ?? ""} {snapshot.member.classNameEn}
                </p>
              )}
            </>
          )}
        </div>
        <div className="border-t border-dashed border-border pt-2 space-y-1">
          <div className="flex justify-between">
            <span>{showAllDay ? "All day" : "Playtime"}</span>
            <span>฿{snapshot.bill.subtotalTableFee.toFixed(0)}</span>
          </div>
          {isHourly &&
            snapshot.tableFeeLines && snapshot.tableFeeLines.length > 1 &&
            snapshot.tableFeeLines.map((line, i) => (
              <div key={line.playerId} className="flex justify-between pl-2 text-[11px] text-foreground-muted">
                <span>
                  P{i + 1} {line.cappedAtDailyCap ? "All day" : formatMinutesShort(line.billableMinutes)}
                </span>
                <span>฿{line.fee.toFixed(0)}</span>
              </div>
            ))}
          {snapshot.itemsByCategory ? (
            snapshot.itemsByCategory.map((group) => (
              <div key={group.categoryId} className="space-y-1">
                <div className="flex justify-between">
                  <span>{group.categoryName}</span>
                  <span>฿{group.subtotal.toFixed(0)}</span>
                </div>
                {group.items.map((item) => (
                  <div key={item.id} className="flex justify-between pl-2 text-[11px] text-foreground-muted">
                    <span>
                      {item.quantity}× {item.nameEn}
                    </span>
                    <span>฿{item.lineTotal.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <>
              <div className="flex justify-between">
                <span>Food/drink</span>
                <span>฿{snapshot.bill.subtotalFoodDrink.toFixed(0)}</span>
              </div>
              {snapshot.foodDrinkItems?.map((item) => (
                <div key={item.id} className="flex justify-between pl-2 text-[11px] text-foreground-muted">
                  <span>
                    {item.quantity}× {item.nameEn}
                  </span>
                  <span>฿{item.lineTotal.toFixed(0)}</span>
                </div>
              ))}
            </>
          )}
          {/* A redeemed free item is a separate gift (§Free item
              redemptions), not a discount — no ฿ figure, just what the
              guest received. */}
          {snapshot.discounts
            .filter((d) => d.isFreeItem)
            .map((d, i) => (
              <div key={i} className="flex justify-between">
                <span>🎁 {d.label}</span>
              </div>
            ))}
          {snapshot.discounts
            .filter((d) => !d.isFreeItem)
            .map((d, i) => (
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
