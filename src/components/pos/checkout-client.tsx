"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc/client";
import type { AppRouter } from "@/server/trpc/routers/_app";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ReceiptView } from "./receipt-view";
import { QrCodeImage } from "@/components/back-office/qr-code-image";
import { buildPromptPayPayload } from "@/lib/promptpay";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type CheckoutResult = RouterOutputs["checkout"]["recordPayment"];

type PaymentMethod = "CASH" | "PROMPTPAY" | "CARD" | "OTHER";

interface PaymentRow {
  key: string;
  method: PaymentMethod;
  amount: string;
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
  const { data: checkoutSettings } = trpc.settings.getCheckout.useQuery();

  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">(
    "PERCENTAGE",
  );
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([
    { key: "p1", method: "CASH", amount: "" },
  ]);
  const [result, setResult] = useState<CheckoutResult | null>(null);

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

  const paidTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = preview.bill.total - paidTotal;

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="text-sm text-teal-600">
        ← Back to table
      </button>
      <h1 className="text-2xl font-semibold text-foreground">
        Checkout — {preview.table.code}
      </h1>

      <Card className="space-y-2">
        <p className="text-sm font-medium text-foreground-muted">Bill</p>
        <div className="flex justify-between text-sm">
          <span>Table time</span>
          <span>฿{preview.bill.subtotalTableFee.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Food/drink</span>
          <span>฿{preview.bill.subtotalFoodDrink.toFixed(0)}</span>
        </div>
        {preview.appliedDiscounts.map((d) => (
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

      {eligiblePromotions && eligiblePromotions.length > 0 && (
        <Card className="space-y-2">
          <p className="text-sm font-medium text-foreground-muted">Available promotions</p>
          <div className="space-y-2">
            {eligiblePromotions.map((promo) => (
              <div
                key={promo.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm"
              >
                <span>
                  {promo.name}
                  {promo.rewardMenuItemName ? ` (free: ${promo.rewardMenuItemName})` : ""} —{" "}
                  <span className="text-teal-600">save ฿{promo.previewAmount.toFixed(0)}</span>
                  {promo.memberOnly && (
                    <span className="text-xs text-foreground-muted"> · members only</span>
                  )}
                </span>
                <Button
                  size="md"
                  variant="outline"
                  disabled={applyPromotion.isPending}
                  onClick={() => applyPromotion.mutate({ sessionId, promotionId: promo.id })}
                >
                  Apply
                </Button>
              </div>
            ))}
          </div>
          {applyPromotion.error && (
            <p className="text-sm text-status-danger">{applyPromotion.error.message}</p>
          )}
        </Card>
      )}

      <Card className="space-y-2">
        <p className="text-sm font-medium text-foreground-muted">Apply discount</p>
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

      <Card className="space-y-3">
        <p className="text-sm font-medium text-foreground-muted">Payment</p>
        {payments.map((p, i) => (
          <div key={p.key} className="flex items-center gap-2">
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
              placeholder="Amount"
              className="h-11 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
            />
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
                    { key: `p${rows.length + 1}-${Date.now()}`, method: "CASH", amount: "" },
                  ])
                }
                className="text-sm text-teal-600"
              >
                + Split
              </button>
            )}
          </div>
        ))}
        {(() => {
          const promptPayRow = payments.find((p) => p.method === "PROMPTPAY");
          if (!promptPayRow) return null;
          const qrAmount = Number(promptPayRow.amount) > 0 ? Number(promptPayRow.amount) : remaining;
          if (!checkoutSettings?.promptpayId) {
            return (
              <p className="text-sm text-status-warning">
                No PromptPay ID set — add one in Settings → Checkout to show a scan-to-pay QR here.
              </p>
            );
          }
          if (qrAmount <= 0) return null;
          return (
            <div className="flex flex-col items-center gap-2 rounded-xl bg-background p-4">
              <QrCodeImage
                value={buildPromptPayPayload(checkoutSettings.promptpayId, qrAmount)}
                size={180}
              />
              <p className="text-sm text-foreground-muted">
                Scan to pay ฿{qrAmount.toFixed(2)} — confirm once the transfer lands in your banking app.
              </p>
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
                .filter((p) => Number(p.amount) > 0)
                .map((p) => ({ method: p.method, amount: Number(p.amount) })),
            })
          }
        >
          {recordPayment.isPending ? "Processing…" : "Confirm Payment"}
        </Button>
      </Card>
    </div>
  );
}
