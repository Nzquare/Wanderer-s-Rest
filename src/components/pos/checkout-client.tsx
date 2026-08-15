"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc/client";
import type { AppRouter } from "@/server/trpc/routers/_app";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ReceiptView } from "./receipt-view";
import { MemberLinkPanel } from "./member-link-panel";
import { QrCodeImage } from "@/components/back-office/qr-code-image";
import { buildPromptPayPayload } from "@/lib/promptpay";
import { formatMinutesShort } from "./live-timer";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type CheckoutResult = RouterOutputs["checkout"]["recordPayment"];
type CategoryGroup = RouterOutputs["checkout"]["getPreview"]["itemsByCategory"][number];

type PaymentMethod = "CASH" | "PROMPTPAY" | "CARD" | "OTHER";

/**
 * Order items grouped by their menu category — Drinks, Snacks, Goods,
 * whatever categories exist — each its own subtotal line, instead of one
 * blanket "Food/drink" bucket that would mislabel non-food merchandise.
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
  const { data: eligiblePromotions } = trpc.checkout.listEligiblePromotions.useQuery({
    sessionId,
  });
  const { data: allPromotions } = trpc.checkout.listAllPromotions.useQuery();
  const { data: checkoutSettings } = trpc.settings.getCheckout.useQuery();

  // "Available promotions" and "Apply discount -> From promotion" used to be
  // two separate promotion pickers on screen at once, which just looked like
  // duplication — consolidated into one "Add promotion" popup that lists
  // every active promotion, one-tap Apply for eligible ones and an inline
  // reason-gated override for ineligible ones. Custom (non-promotion)
  // discount amounts stay their own small collapsible section since they
  // aren't a promotion pick at all.
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [overridingPromoId, setOverridingPromoId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
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
  // printAs below). flushSync forces the class swap to land in the DOM
  // before print() reads it — a plain setState wouldn't be guaranteed to
  // flush in time.
  const [printMode, setPrintMode] = useState<"invoice" | "promptpay">("invoice");
  function printAs(mode: "invoice" | "promptpay") {
    flushSync(() => setPrintMode(mode));
    window.print();
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
      ]),
  });
  const applyPromotion = trpc.checkout.applyPromotion.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.checkout.getPreview.invalidate({ sessionId }),
        utils.checkout.listEligiblePromotions.invalidate({ sessionId }),
      ]),
  });
  const applyPromotionOverride = trpc.checkout.applyPromotionOverride.useMutation({
    onSuccess: async () => {
      setOverridingPromoId(null);
      setOverrideReason("");
      await Promise.all([
        utils.checkout.getPreview.invalidate({ sessionId }),
        utils.checkout.listEligiblePromotions.invalidate({ sessionId }),
      ]);
    },
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

  const appliedPromotionIds = new Set(
    preview.appliedDiscounts
      .map((d) => d.promotionId)
      .filter((id): id is string => !!id),
  );
  const eligiblePromotionIds = new Set((eligiblePromotions ?? []).map((p) => p.id));
  // "Add promotion" modal list — every active promotion except ones already
  // applied to this bill; each row is either one-tap-eligible or needs an
  // override reason, decided per-row below via eligiblePromotionIds.
  const promotionChoices = (allPromotions ?? []).filter(
    (p) => !appliedPromotionIds.has(p.id),
  );

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
        {preview.appliedDiscounts.map((d) => (
          <div key={d.id} className="flex justify-between text-sm text-status-danger">
            <span>{d.label}</span>
            <div className="flex items-center gap-2">
              <span>{d.isFreeItem ? "Free" : `-฿${d.amount.toFixed(0)}`}</span>
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
        className={printMode === "invoice" ? "hidden print:block" : "hidden"}
      >
        <div className="mx-auto max-w-xs space-y-2 p-4 font-mono text-sm">
          <div className="text-center">
            <p className="font-semibold">Wanderer&apos;s Rest</p>
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
            {preview.appliedDiscounts.map((d) => (
              <div key={d.id} className="flex justify-between">
                <span>{d.label}</span>
                <span>{d.isFreeItem ? "Free" : `-฿${d.amount.toFixed(0)}`}</span>
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

      <Card className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground-muted">Discounts</p>
        <div className="flex gap-2">
          <Button size="md" variant="outline" onClick={() => setPromoModalOpen(true)}>
            + Add promotion
          </Button>
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

      <Modal open={promoModalOpen} onClose={() => setPromoModalOpen(false)}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-foreground">Add promotion</p>
            <button
              onClick={() => setPromoModalOpen(false)}
              className="text-sm text-foreground-muted"
            >
              Close
            </button>
          </div>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {promotionChoices.length === 0 && (
              <p className="text-sm text-foreground-muted">
                No promotions left to apply — every active one is already on this bill.
              </p>
            )}
            {promotionChoices.map((p) => {
              const eligible = eligiblePromotionIds.has(p.id);
              const eligibleInfo = eligiblePromotions?.find((e) => e.id === p.id);
              const overriding = overridingPromoId === p.id;
              return (
                <div
                  key={p.id}
                  className="space-y-2 rounded-lg bg-background px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {eligibleInfo?.earnedViaBenefit && (
                        <span className="mr-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-300">
                          🎁 Your reward
                        </span>
                      )}
                      {p.name} —{" "}
                      {p.type === "PERCENTAGE"
                        ? `${p.value}% off`
                        : p.type === "FIXED_AMOUNT"
                          ? `฿${p.value} off`
                          : `free: ${p.rewardMenuItemName ?? "item"}`}
                      {eligible && eligibleInfo && (
                        <span className="text-teal-600">
                          {" "}
                          · save ฿{eligibleInfo.previewAmount.toFixed(0)}
                        </span>
                      )}
                      {!eligible && (
                        <span className="text-xs text-foreground-muted">
                          {" "}
                          · not eligible right now
                        </span>
                      )}
                    </span>
                    {eligible ? (
                      <Button
                        size="md"
                        variant="outline"
                        disabled={applyPromotion.isPending}
                        onClick={() =>
                          applyPromotion.mutate({ sessionId, promotionId: p.id })
                        }
                      >
                        Apply
                      </Button>
                    ) : (
                      <Button
                        size="md"
                        variant="outline"
                        onClick={() => {
                          setOverridingPromoId(overriding ? null : p.id);
                          setOverrideReason("");
                        }}
                      >
                        {overriding ? "Cancel" : "Override"}
                      </Button>
                    )}
                  </div>
                  {overriding && (
                    <div className="flex flex-wrap items-end gap-2">
                      <input
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Reason (e.g. manager approved outside normal window)"
                        className="h-10 flex-1 min-w-40 rounded-lg border border-border bg-surface px-2 text-sm"
                      />
                      <Button
                        size="md"
                        variant="danger"
                        disabled={!overrideReason.trim() || applyPromotionOverride.isPending}
                        onClick={() =>
                          applyPromotionOverride.mutate({
                            sessionId,
                            promotionId: p.id,
                            reason: overrideReason.trim(),
                          })
                        }
                      >
                        Confirm override
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {applyPromotion.error && (
            <p className="text-sm text-status-danger">{applyPromotion.error.message}</p>
          )}
          {applyPromotionOverride.error && (
            <p className="text-sm text-status-danger">{applyPromotionOverride.error.message}</p>
          )}
        </div>
      </Modal>

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
              <option value="CASH">Cash</option>
              <option value="PROMPTPAY">PromptPay / QR</option>
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
                className={printMode === "promptpay" ? "hidden print:block" : "hidden"}
              >
                <div className="mx-auto max-w-xs space-y-2 p-4 text-center font-mono text-sm">
                  <p className="font-semibold">Wanderer&apos;s Rest</p>
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
        {recordPayment.error && (
          <p className="text-sm text-status-danger">{recordPayment.error.message}</p>
        )}
        <Button
          size="xl"
          className="w-full"
          disabled={Math.abs(remaining) > 0.5 || recordPayment.isPending}
          onClick={() =>
            recordPayment.mutate({
              sessionId,
              payments: payments
                .map((p, i) => ({ method: p.method, amount: effectiveAmounts[i] }))
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
