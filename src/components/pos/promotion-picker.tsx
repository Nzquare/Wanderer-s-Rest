"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/**
 * "+ Add promotion" trigger + modal — lists every active promotion, one-tap
 * Apply for eligible ones (including a member's own earned reward, tagged
 * "🎁 Your reward" — see checkout.ts's earnedViaBenefit) and an inline
 * reason-gated override for ineligible ones.
 *
 * Self-contained: fetches its own eligible/all-promotions/already-applied
 * lists, so it can be dropped in wherever a promotion might apply to a
 * session — Checkout and the table page before checkout alike
 * (§Table-page promotions) — without the caller wiring up its own copy of
 * this flow. `onApplied` lets the caller invalidate whatever else its own
 * view depends on (e.g. Checkout's getPreview) alongside this component's
 * own queries.
 */
export function PromotionPicker({
  sessionId,
  onApplied,
}: {
  sessionId: string;
  onApplied?: () => unknown;
}) {
  const utils = trpc.useUtils();
  const { data: eligiblePromotions } = trpc.checkout.listEligiblePromotions.useQuery({
    sessionId,
  });
  const { data: allPromotions } = trpc.checkout.listAllPromotions.useQuery();
  const { data: appliedDiscounts } = trpc.checkout.listAppliedDiscounts.useQuery({ sessionId });

  const [open, setOpen] = useState(false);
  const [overridingPromoId, setOverridingPromoId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  const invalidate = () =>
    Promise.all([
      utils.checkout.listEligiblePromotions.invalidate({ sessionId }),
      utils.checkout.listAppliedDiscounts.invalidate({ sessionId }),
      onApplied?.(),
    ]);

  const applyPromotion = trpc.checkout.applyPromotion.useMutation({ onSuccess: invalidate });
  const applyPromotionOverride = trpc.checkout.applyPromotionOverride.useMutation({
    onSuccess: async () => {
      setOverridingPromoId(null);
      setOverrideReason("");
      await invalidate();
    },
  });

  const appliedPromotionIds = new Set(
    (appliedDiscounts ?? [])
      .map((d) => d.promotionId)
      .filter((id): id is string => !!id),
  );
  const eligiblePromotionIds = new Set((eligiblePromotions ?? []).map((p) => p.id));
  // Every active promotion except ones already applied to this bill; each
  // row is either one-tap-eligible or needs an override reason, decided
  // per-row below via eligiblePromotionIds.
  const promotionChoices = (allPromotions ?? []).filter((p) => !appliedPromotionIds.has(p.id));

  return (
    <>
      <Button size="md" variant="outline" onClick={() => setOpen(true)}>
        + Add promotion
      </Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-foreground">Add promotion</p>
            <button onClick={() => setOpen(false)} className="text-sm text-foreground-muted">
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
                <div key={p.id} className="space-y-2 rounded-lg bg-background px-3 py-2 text-sm">
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
                        <span className="text-xs text-foreground-muted"> · not eligible right now</span>
                      )}
                    </span>
                    {eligible ? (
                      <Button
                        size="md"
                        variant="outline"
                        disabled={applyPromotion.isPending}
                        onClick={() => applyPromotion.mutate({ sessionId, promotionId: p.id })}
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
    </>
  );
}
