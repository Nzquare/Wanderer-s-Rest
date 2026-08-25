"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc/client";
import type { AppRouter } from "@/server/trpc/routers/_app";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ReceiptView } from "./receipt-view";
import { MemberLinkPanel } from "./member-link-panel";
import { PromotionPicker } from "./promotion-picker";
import { QrCodeImage } from "@/components/back-office/qr-code-image";
import { buildPromptPayPayload } from "@/lib/promptpay";
import { printOnce } from "@/lib/print-once";
import { formatMinutesShort } from "./live-timer";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type CheckoutResult = RouterOutputs["checkout"]["recordPayment"];
type CategoryGroup = RouterOutputs["checkout"]["getPreview"]["itemsByCategory"][number];

type PaymentMethod = "CASH" | "PROMPTPAY" | "CARD" | "OTHER";

/**
 * Order items grouped by their menu category — Drinks, Snacks, Goods,
 * whatever categories exist — each its own subtotal line, instead of one
 * blanket "Food/drink" bucket that would mislabel non-food merchandise.
 *
 * Never touched by a Free Item promotion redemption (§Free item
 * redemptions) — what's ordered here is what was actually ordered and
 * priced at order time; a redeemed free item is a separate gift, shown of
 * its own accord below, not a change to any of these lines.
 */
function ItemsByCategoryLines({ groups, compact }: { groups: CategoryGroup[]; compact?: boolean }) {
  const headingCls = compact ? "flex justify-between" : "flex justify-between text-sm";
  const lineCls = compact
    ? "flex justify-between pl-2 text-xs"
    : "flex justify-between pl-3 text-xs text-foreground-muted";
  return (
    <>
      {groups.map((group) => (
        <div key={group.categoryId} className="space-y-1">
          <div className={headingCls}>
            <span>{group.categoryName}</span>
            <span>฿{group.subtotal.toFixed(0)}</span>
          </div>
          {group.items.map((item) => (
            <div key={item.id} className={lineCls}>
              <span>
                {item.quantity}× {item.nameEn}
              </span>
              <span>฿{item.lineTotal.toFixed(0)}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

interface PaymentRow {
  key: string;
  method: PaymentMethod;
  amount: string;
  /** CASH only — what the customer actually handed over, purely for the
   * change-due calculator below. Never sent to recordPayment; `amount`
   * (locked to the remaining balance for a single cash payment, same as
   * PROMPTPAY) is what's recorded as paid. */
  cashReceived: string;
}

export function CheckoutClient({
  sessionId,
  tableId,
}: {
  sessionId: string;
  tableId: string;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: preview, isLoading } = trpc.checkout.getPreview.useQuery({
    sessionId,
  });
  const { data: checkoutSettings } = trpc.settings.getCheckout.useQuery();
  const { data: cafeSettings } = trpc.settings.getCafe.useQuery();
  // Same fallback as receipt-view.tsx — matches what these settings
  // already default to, so an unconfigured install prints the same thing
  // it always did (§Receipt settings wiring).
  const cafeName = cafeSettings?.nameEn ?? "Wanderer's Rest";

  // PromotionPicker (shared with the table page — §Table-page promotions)
  // owns the "Add promotion" popup itself: every active promotion,
  // one-tap Apply for eligible ones, inline reason-gated override for
  // ineligible ones. Custom (non-promotion) discount amounts stay their
  // own small collapsible section here since they aren't a promotion
  // pick at all.
  const [customOpen, setCustomOpen] = useState(false);
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">(
    "PERCENTAGE",
  );
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([
    { key: "p1", method: "CASH", amount: "", cashReceived: "" },
  ]);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  // Which hidden print area is "armed" for the next window.print() —
  // invoice and the PromptPay QR slip can both be in the DOM at once on
  // this page, so only one may carry the print:block class at a time (see
  // printAs below). Starts at null, not defaulted to "invoice" — this
  // used to default straight to "invoice" armed, which meant the invoice
  // area already carried print-area/print:block the instant the page
  // loaded, before the cashier ever clicked a print button (§sometimes
  // wrong thing printed) — any print triggered on this page for any
  // other reason (notably the Cashier shell's OrderAlertBanner
  // auto-printing an unrelated kitchen ticket) would print the invoice
  // right along with it. Routed through the shared printOnce queue for
  // the same reason — this page keeps that banner mounted too, so
  // without the shared queue an auto-print could still land mid-print
  // and swap which area actually goes to the printer.
  const [printMode, setPrintMode] = useState<"invoice" | "promptpay" | null>(null);
  function printAs(mode: "invoice" | "promptpay") {
    printOnce(
      () => setPrintMode(mode),
      () => {},
    );
  }

  const applyDiscount = trpc.checkout.applyManualDiscount.useMutation({
    onSuccess: async () => {
      setDiscountValue("");
      setDiscountReason("");
      await Promise.all([
        utils.checkout.getPreview.invalidate({ sessionId }),
        utils.checkout.listEligiblePromotions.invalidate({ sessionId }),
      ]);
    },
  });
  const removeDiscount = trpc.checkout.removeDiscount.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.checkout.getPreview.invalidate({ sessionId }),
        utils.checkout.listEligiblePromotions.invalidate({ sessionId }),
        // PromotionPicker below reads its own listAppliedDiscounts query to
        // decide what's already on the bill — without invalidating it too,
        // a promotion removed here still looked "applied" to the picker and
        // never came back as choosable.
        utils.checkout.listAppliedDiscounts.invalidate({ sessionId }),
      ]),
  });
  const recordPayment = trpc.checkout.recordPayment.useMutation({
    onSuccess: async (data) => {
      setResult(data);
      await Promise.all([
        utils.sessions.listTables.invalidate(),
        utils.sessions.getTableDetail.invalidate({ tableId }),
      ]);
    },
  });
  const markAvailable = trpc.checkout.markTableAvailable.useMutation();
  const backToTable = trpc.sessions.backToTable.useMutation({
    onSuccess: () => {
      utils.sessions.listTables.invalidate();
      router.push(`/cashier/tables/${tableId}`);
    },
  });

  if (isLoading || !preview) {
    return <p className="text-sm text-foreground-muted">Loading bill…</p>;
  }

  if (result) {
    return (
      <ReceiptView
        snapshot={result.snapshot}
        progression={result.expSummary}
        onDone={() => {
          markAvailable.mutate({ tableId });
          router.push("/cashier");
        }}
      />
    );
  }

  // PromptPay only auto-locks to the full total when it's the sole payment
  // row — nothing to split against, so there's no reason to make the
  // cashier type the number that's already on screen. The moment it's part
  // of a split, the lock comes off and it behaves like any other method
  // (typed, adjustable) since the cashier is the one who knows how the
  // split should actually divide.
  // Once every fee line has hit the daily cap, the bill is pinned flat for
  // the rest of the day just like FIXED/PACKAGE pricing — show "All day"
  // instead of a per-player minutes breakdown that no longer means anything.
  const allLinesCapped =
    preview.tableFeeLines.length > 0 &&
    preview.tableFeeLines.every((l) => l.cappedAtDailyCap);
  const isHourly = preview.pricingModel === "HOURLY";
  const showAllDay = !isHourly || allLinesCapped;

  const isSplitPayment = payments.length > 1;
  // A single payment — cash, PromptPay, card, or other — always covers
  // the whole bill, whatever the method, so it locks to the remaining
  // balance instead of asking the cashier to type an amount that can
  // only ever be right one way. The moment it's part of a split, the
  // lock comes off since each row then covers however much of the bill
  // the cashier decides it should (see the input fallback below).
  const effectiveAmounts: number[] = [];
  {
    let runningTotal = 0;
    for (const p of payments) {
      const amount = !isSplitPayment
        ? Math.max(0, Math.round((preview.bill.total - runningTotal) * 100) / 100)
        : Number(p.amount) || 0;
      effectiveAmounts.push(amount);
      runningTotal += amount;
    }
  }
  const paidTotal = effectiveAmounts.reduce((s, a) => s + a, 0);
  const remaining = preview.bill.total - paidTotal;

  // Cash received must actually be entered — and cover the row's own
  // amount — before Confirm Payment is allowed, so a cashier can't
  // finish a cash sale without ever recording what the customer handed
  // over (and the change owed). Only rows that'll actually be submitted
  // (effectiveAmount > 0) count, same filter recordPayment's own mutate
  // call below applies.
  const cashRowIssues = payments
    .map((p, i) => ({ ...p, effectiveAmount: effectiveAmounts[i] }))
    .filter((p) => p.method === "CASH" && p.effectiveAmount > 0);
  const cashReceivedMissing = cashRowIssues.some((p) => !(Number(p.cashReceived) > 0));
  const cashReceivedShort = cashRowIssues.some(
    (p) => Number(p.cashReceived) > 0 && Number(p.cashReceived) < p.effectiveAmount,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => router.back()} className="text-sm text-teal-600">
          ← Back to table
        </button>
        <Button
          size="md"
          variant="outline"
          disabled={backToTable.isPending}
          onClick={() => backToTable.mutate({ sessionId })}
        >
          {backToTable.isPending ? "Reopening…" : "Order more / Back to Table"}
        </Button>
      </div>
      <h1 className="text-2xl font-semibold text-foreground">
        Checkout — {preview.table.code}
      </h1>

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground-muted">Bill</p>
          <Button size="md" variant="outline" onClick={() => printAs("invoice")}>
            Print Invoice
          </Button>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>{showAllDay ? "All day" : "Playtime"}</span>
            <span>฿{preview.bill.subtotalTableFee.toFixed(0)}</span>
          </div>
          {isHourly &&
            preview.tableFeeLines.length > 1 &&
            preview.tableFeeLines.map((line, i) => (
              <div key={line.playerId} className="flex justify-between pl-3 text-xs text-foreground-muted">
                <span>
                  Player {i + 1} ·{" "}
                  {line.cappedAtDailyCap ? "All day" : formatMinutesShort(line.billableMinutes)}
                </span>
                <span>฿{line.fee.toFixed(0)}</span>
              </div>
            ))}
        </div>
        <ItemsByCategoryLines groups={preview.itemsByCategory} />
        {/* A redeemed free item is a separate gift, unlinked from the
            order above (§Free item redemptions) — not a discount, so no ฿
            figure, just what got redeemed and a way to undo it. It never
            touches the total either. */}
        {preview.appliedDiscounts
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
        {/* EXP_BONUS (§Award EXP as promotion) is bonus EXP, not a ฿
            discount — its label already reads "Name (+50 EXP)" (see
            checkout.ts's applyPromotion), so no ฿ figure here either,
            same reasoning as the free-item gift line above. */}
        {preview.appliedDiscounts
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
        {preview.appliedDiscounts
          .filter((d) => !d.isFreeItem && !d.isExpBonus)
          .map((d) => (
            <div key={d.id} className="flex justify-between text-sm text-status-danger">
              <span>{d.label}</span>
              <div className="flex items-center gap-2">
                <span>-฿{d.amount.toFixed(0)}</span>
                <button
                  onClick={() => removeDiscount.mutate({ discountId: d.id })}
                  className="text-xs underline"
                >
                  remove
                </button>
              </div>
            </div>
          ))}
        {preview.bill.serviceChargeAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span>Service charge</span>
            <span>฿{preview.bill.serviceChargeAmount.toFixed(0)}</span>
          </div>
        )}
        {preview.bill.taxAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span>Tax</span>
            <span>฿{preview.bill.taxAmount.toFixed(0)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-2 text-lg font-semibold">
          <span>Total</span>
          <span>฿{preview.bill.total.toFixed(0)}</span>
        </div>
      </Card>

      {/* Printed invoice — hidden on screen, shown only by @media print
          (see globals.css #invoice-print-area). A guest reviewing/paying
          the bill gets a compact itemized slip, separate from the themed
          on-screen card above so print styling doesn't fight the app UI. */}
      <div
        id="invoice-print-area"
        style={
          {
            "--receipt-print-width": `${checkoutSettings?.printerWidthMm ?? 80}mm`,
          } as CSSProperties
        }
        className={printMode === "invoice" ? "print-area hidden print:block" : "hidden"}
      >
        <div className="mx-auto max-w-xs space-y-2 p-4 font-mono text-sm">
          <div className="text-center">
            <p className="font-semibold">{cafeName}</p>
            <p className="text-xs">Invoice — Table {preview.table.code}</p>
            <p className="text-xs">{new Date().toLocaleString()}</p>
          </div>
          <div className="border-t border-dashed border-border pt-2 space-y-1">
            <div className="flex justify-between">
              <span>{showAllDay ? "All day" : "Playtime"}</span>
              <span>฿{preview.bill.subtotalTableFee.toFixed(0)}</span>
            </div>
            {isHourly &&
              preview.tableFeeLines.length > 1 &&
              preview.tableFeeLines.map((line, i) => (
                <div key={line.playerId} className="flex justify-between pl-2 text-xs">
                  <span>
                    P{i + 1} {line.cappedAtDailyCap ? "All day" : formatMinutesShort(line.billableMinutes)}
                  </span>
                  <span>฿{line.fee.toFixed(0)}</span>
                </div>
              ))}
            <ItemsByCategoryLines groups={preview.itemsByCategory} compact />
            {/* A redeemed free item is a separate gift (§Free item
                redemptions), and an EXP_BONUS grants EXP not money
                (§Award EXP as promotion) — neither gets a ฿ figure. */}
            {preview.appliedDiscounts
              .filter((d) => d.isFreeItem)
              .map((d) => (
                <div key={d.id} className="flex justify-between">
                  <span>🎁 {d.label}</span>
                </div>
              ))}
            {preview.appliedDiscounts
              .filter((d) => d.isExpBonus)
              .map((d) => (
                <div key={d.id} className="flex justify-between">
                  <span>⭐ {d.label}</span>
                </div>
              ))}
            {preview.appliedDiscounts
              .filter((d) => !d.isFreeItem && !d.isExpBonus)
              .map((d) => (
                <div key={d.id} className="flex justify-between">
                  <span>{d.label}</span>
                  <span>-฿{d.amount.toFixed(0)}</span>
                </div>
              ))}
            {preview.bill.serviceChargeAmount > 0 && (
              <div className="flex justify-between">
                <span>Service charge</span>
                <span>฿{preview.bill.serviceChargeAmount.toFixed(0)}</span>
              </div>
            )}
            {preview.bill.taxAmount > 0 && (
              <div className="flex justify-between">
                <span>Tax</span>
                <span>฿{preview.bill.taxAmount.toFixed(0)}</span>
              </div>
            )}
          </div>
          <div className="border-t border-dashed border-border pt-2 flex justify-between font-semibold">
            <span>Total</span>
            <span>฿{preview.bill.total.toFixed(0)}</span>
          </div>
          <p className="pt-2 text-center text-xs">This is not a receipt — pay at the counter.</p>
        </div>
      </div>

      <Card className="space-y-2">
        <p className="text-sm font-medium text-foreground-muted">Member</p>
        <MemberLinkPanel
          sessionId={sessionId}
          member={
            preview.memberPreview
              ? { id: preview.memberPreview.id, adventurerName: preview.memberPreview.adventurerName }
              : null
          }
          onChanged={() =>
            Promise.all([
              utils.checkout.getPreview.invalidate({ sessionId }),
              utils.checkout.listEligiblePromotions.invalidate({ sessionId }),
              utils.sessions.listTables.invalidate(),
            ])
          }
        />
      </Card>

      {preview.memberPreview && (
        <Card className="text-sm">
          <p className="font-medium text-foreground">
            {preview.memberPreview.adventurerName} will earn{" "}
            <span className="text-teal-600">+{preview.memberPreview.projectedExp} EXP</span>
          </p>
          {preview.memberPreview.levelAfter > preview.memberPreview.levelBefore && (
            <p className="text-foreground-muted">
              Level {preview.memberPreview.levelBefore} → {preview.memberPreview.levelAfter}
              {preview.memberPreview.rankAfter !== preview.memberPreview.rankBefore &&
                ` · Rank up to ${preview.memberPreview.rankAfter}!`}
            </p>
          )}
        </Card>
      )}

      {/* Deposits aren't auto-credited (§Reservation deposit reminder) —
          this just makes it hard to forget one's sitting there, and
          prefills the custom-discount box so applying it is still a
          deliberate click, not something that could silently double-up. */}
      {preview.depositReminder && (
        <Card className="flex flex-wrap items-center justify-between gap-2 border-status-warning/40 bg-status-warning/10">
          <p className="text-sm text-foreground">
            This table has a <strong>฿{preview.depositReminder.amount}</strong> reservation
            deposit already collected — remember to deduct it from the bill.
          </p>
          <Button
            size="md"
            variant="outline"
            onClick={() => {
              setDiscountType("FIXED_AMOUNT");
              setDiscountValue(String(preview.depositReminder!.amount));
              setDiscountReason("Reservation deposit already collected");
              setCustomOpen(true);
            }}
          >
            Deduct now
          </Button>
        </Card>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground-muted">Discounts</p>
        <div className="flex gap-2">
          <PromotionPicker
            sessionId={sessionId}
            onApplied={() => utils.checkout.getPreview.invalidate({ sessionId })}
          />
          <Button size="md" variant="outline" onClick={() => setCustomOpen((v) => !v)}>
            + Custom discount
          </Button>
        </div>
      </Card>

      {customOpen && (
        <Card className="space-y-2">
          <p className="text-sm font-medium text-foreground-muted">Custom discount</p>
          <div className="flex flex-wrap items-end gap-2">
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as typeof discountType)}
              className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="PERCENTAGE">%</option>
              <option value="FIXED_AMOUNT">฿ fixed</option>
            </select>
            <input
              type="number"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder="Value"
              className="h-10 w-24 rounded-lg border border-border bg-background px-2 text-sm"
            />
            <input
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="Reason"
              className="h-10 flex-1 min-w-32 rounded-lg border border-border bg-background px-2 text-sm"
            />
            <Button
              size="md"
              variant="outline"
              disabled={!discountValue || !discountReason || applyDiscount.isPending}
              onClick={() =>
                applyDiscount.mutate({
                  sessionId,
                  type: discountType,
                  value: Number(discountValue),
                  reason: discountReason,
                })
              }
            >
              Apply
            </Button>
          </div>
          {applyDiscount.error && (
            <p className="text-sm text-status-danger">{applyDiscount.error.message}</p>
          )}
        </Card>
      )}

      <Card className="space-y-3">
        <p className="text-sm font-medium text-foreground-muted">Payment</p>
        {payments.map((p, i) => {
          const isCash = p.method === "CASH";
          const isLocked = !isSplitPayment;
          const received = Number(p.cashReceived) || 0;
          const change = received - effectiveAmounts[i];
          return (
          <div key={p.key} className="space-y-1">
          <div className="flex items-center gap-2">
            <select
              value={p.method}
              onChange={(e) =>
                setPayments((rows) =>
                  rows.map((r) =>
                    r.key === p.key
                      ? { ...r, method: e.target.value as PaymentMethod }
                      : r,
                  ),
                )
              }
              className="h-11 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="PROMPTPAY">PromptPay / QR</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="OTHER">Other</option>
            </select>
            {isLocked ? (
              <div className="flex h-11 flex-1 items-center rounded-lg border border-border bg-background px-2 text-sm text-foreground-muted">
                ฿{effectiveAmounts[i].toFixed(2)} — locked to remaining balance
              </div>
            ) : (
              <input
                type="number"
                value={p.amount}
                onChange={(e) =>
                  setPayments((rows) =>
                    rows.map((r) =>
                      r.key === p.key ? { ...r, amount: e.target.value } : r,
                    ),
                  )
                }
                placeholder={`Amount (e.g. ${remaining.toFixed(0)} left)`}
                className="h-11 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
              />
            )}
            {payments.length > 1 && (
              <button
                onClick={() =>
                  setPayments((rows) => rows.filter((r) => r.key !== p.key))
                }
                className="text-sm text-status-danger"
              >
                ✕
              </button>
            )}
            {i === payments.length - 1 && (
              <button
                onClick={() =>
                  setPayments((rows) => [
                    ...rows,
                    {
                      key: `p${rows.length + 1}-${Date.now()}`,
                      method: "CASH",
                      amount: "",
                      cashReceived: "",
                    },
                  ])
                }
                className="text-sm text-teal-600"
              >
                + Split
              </button>
            )}
          </div>
          {isCash && (
            <div className="flex items-center gap-2 pl-1">
              <label className="text-xs text-foreground-muted">Cash received</label>
              <input
                type="number"
                value={p.cashReceived}
                onChange={(e) =>
                  setPayments((rows) =>
                    rows.map((r) =>
                      r.key === p.key ? { ...r, cashReceived: e.target.value } : r,
                    ),
                  )
                }
                placeholder={`e.g. ${Math.ceil(effectiveAmounts[i] / 100) * 100}`}
                className="h-9 w-28 rounded-lg border border-border bg-background px-2 text-sm"
              />
              {p.cashReceived && (
                <span
                  className={
                    change >= 0 ? "text-xs font-medium text-status-success" : "text-xs text-status-warning"
                  }
                >
                  {change >= 0
                    ? `Change: ฿${change.toFixed(2)}`
                    : `Short by ฿${Math.abs(change).toFixed(2)}`}
                </span>
              )}
            </div>
          )}
          </div>
          );
        })}
        {(() => {
          const promptPayIndex = payments.findIndex((p) => p.method === "PROMPTPAY");
          if (promptPayIndex === -1) return null;
          const qrAmount = effectiveAmounts[promptPayIndex];
          if (!checkoutSettings?.promptpayId) {
            return (
              <p className="text-sm text-status-warning">
                No PromptPay ID set — add one in Settings → Checkout to show a scan-to-pay QR here.
              </p>
            );
          }
          if (qrAmount <= 0) return null;
          const qrValue = buildPromptPayPayload(checkoutSettings.promptpayId, qrAmount);
          const printerWidthMm = checkoutSettings.printerWidthMm ?? 80;
          return (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-background p-4">
              <QrCodeImage value={qrValue} size={180} />
              <p className="text-sm text-foreground-muted">
                Scan to pay ฿{qrAmount.toFixed(2)} — confirm once the transfer lands in your banking app.
              </p>
              <Button variant="outline" size="md" onClick={() => printAs("promptpay")}>
                Print QR for customer
              </Button>

              {/* Printed slip — hidden on screen, shown only by @media print
                  (see globals.css #promptpay-print-area). Kept separate from
                  the on-screen QR above so the printout can carry its own
                  compact layout without affecting what staff see live. */}
              <div
                id="promptpay-print-area"
                style={{ "--receipt-print-width": `${printerWidthMm}mm` } as CSSProperties}
                className={printMode === "promptpay" ? "print-area hidden print:block" : "hidden"}
              >
                <div className="mx-auto max-w-xs space-y-2 p-4 text-center font-mono text-sm">
                  <p className="font-semibold">{cafeName}</p>
                  <p className="text-xs">Table {preview.table.code}</p>
                  <div className="flex justify-center py-2">
                    <QrCodeImage value={qrValue} size={220} />
                  </div>
                  <p className="font-semibold">Scan to pay ฿{qrAmount.toFixed(2)}</p>
                  <p className="text-xs">PromptPay — show staff once paid</p>
                </div>
              </div>
            </div>
          );
        })()}
        <div className="flex justify-between text-sm text-foreground-muted">
          <span>Remaining</span>
          <span className={remaining !== 0 ? "text-status-warning" : "text-status-success"}>
            ฿{remaining.toFixed(0)}
          </span>
        </div>
        {cashReceivedMissing && (
          <p className="text-sm text-status-warning">
            Enter the cash received amount before confirming payment.
          </p>
        )}
        {!cashReceivedMissing && cashReceivedShort && (
          <p className="text-sm text-status-warning">
            Cash received doesn&apos;t cover the amount — check what was entered.
          </p>
        )}
        {recordPayment.error && (
          <p className="text-sm text-status-danger">{recordPayment.error.message}</p>
        )}
        <Button
          size="xl"
          className="w-full"
          disabled={
            Math.abs(remaining) > 0.5 ||
            recordPayment.isPending ||
            cashReceivedMissing ||
            cashReceivedShort
          }
          onClick={() =>
            recordPayment.mutate({
              sessionId,
              payments: payments
                .map((p, i) => ({
                  method: p.method,
                  amount: effectiveAmounts[i],
                  // Only meaningful for cash, and only when the cashier
                  // actually typed one — the receipt shows what was
                  // tendered and the change given when present.
                  cashReceived:
                    p.method === "CASH" && Number(p.cashReceived) > 0
                      ? Number(p.cashReceived)
                      : undefined,
                }))
                .filter((p) => p.amount > 0),
            })
          }
        >
          {recordPayment.isPending ? "Processing…" : "Confirm Payment"}
        </Button>
      </Card>
    </div>
  );
}
