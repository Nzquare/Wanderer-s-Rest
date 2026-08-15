"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { describeBenefit } from "@/lib/benefits";
import { cn } from "@/lib/cn";

type StatusFilter = "AVAILABLE" | "USED" | "EXPIRED" | "ALL";

const TABS: { value: StatusFilter; label: string }[] = [
  { value: "AVAILABLE", label: "Available" },
  { value: "USED", label: "Redeemed" },
  { value: "EXPIRED", label: "Expired" },
  { value: "ALL", label: "All" },
];

/**
 * The membership-wide "who's owed something" ledger (§Benefits
 * management) — every member's earned-but-not-yet-honored reward in one
 * list, instead of having to open each member's profile to find out.
 * Redeeming here uses the same benefits.redeem mutation the Adventurer
 * Profile's Benefits banner uses.
 */
export function BenefitsManager() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("AVAILABLE");
  const utils = trpc.useUtils();
  const { data: benefits, isLoading } = trpc.benefits.listAll.useQuery(
    statusFilter === "ALL" ? {} : { status: statusFilter },
  );
  const redeem = trpc.benefits.redeem.useMutation({
    onSuccess: () => utils.benefits.listAll.invalidate(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatusFilter(t.value)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium",
              statusFilter === t.value
                ? "bg-teal-500/15 text-teal-700 dark:text-teal-300"
                : "text-foreground-muted hover:bg-black/5",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-foreground-muted">Loading…</p>}
      {redeem.error && <p className="text-sm text-status-danger">{redeem.error.message}</p>}

      <div className="space-y-2">
        {benefits?.map((b) => (
          <Card key={b.id} className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium text-foreground">
                {b.icon ?? "🎁"} {describeBenefit(b.benefitType, b.benefitConfig)}
              </p>
              <p className="text-sm text-foreground-muted">
                <Link href={`/back-office/members/${b.memberId}`} className="text-teal-600 underline">
                  {b.memberName}
                </Link>
                {b.memberPhone ? ` · ${b.memberPhone}` : ""} · from {b.achievementNameEn} · earned{" "}
                {new Date(b.earnedAt).toLocaleDateString()}
              </p>
              {b.status === "USED" && (
                <p className="text-xs text-foreground-muted">
                  Redeemed {b.usedAt && new Date(b.usedAt).toLocaleDateString()}
                  {b.usedByName ? ` by ${b.usedByName}` : ""}
                </p>
              )}
            </div>
            {b.status === "AVAILABLE" ? (
              <Button
                size="md"
                disabled={redeem.isPending}
                onClick={() => redeem.mutate({ id: b.id })}
              >
                Mark redeemed
              </Button>
            ) : (
              <span className="text-xs font-medium text-foreground-muted">
                {b.status === "USED" ? "Redeemed" : "Expired"}
              </span>
            )}
          </Card>
        ))}
        {benefits?.length === 0 && (
          <p className="text-sm text-foreground-muted">Nothing here.</p>
        )}
      </div>
    </div>
  );
}
