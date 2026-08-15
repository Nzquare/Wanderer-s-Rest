"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * Shown on a table that was seated with OpenTableForm's "No play yet"
 * (§Start Playing) — every player is sitting PAUSED at zero elapsed and
 * no pricing type is set. Picks the price and starts every player's
 * timer together via sessions.startPlaying, the one door out of that
 * state (see its own comment for why per-player Resume is blocked).
 */
export function StartPlayingPanel({
  sessionId,
  tableId,
}: {
  sessionId: string;
  tableId: string;
}) {
  const [pricingTypeId, setPricingTypeId] = useState<string | undefined>();
  const { data: pricingTypes } = trpc.pricingTypes.list.useQuery();
  const utils = trpc.useUtils();

  const startPlaying = trpc.sessions.startPlaying.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.sessions.getTableDetail.invalidate({ tableId }),
        utils.sessions.listTables.invalidate(),
        utils.sessions.listQuickSaleTables.invalidate(),
      ]),
  });

  const chosenId = pricingTypeId ?? pricingTypes?.[0]?.id;

  return (
    <Card className="space-y-3 border-teal-500">
      <div>
        <p className="text-sm font-medium text-foreground">
          Not playing yet — pick a price to start the timer
        </p>
        <p className="text-xs text-foreground-muted">
          The table stays free to order at until the customer wants to play.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {pricingTypes?.map((pt) => (
          <button
            key={pt.id}
            onClick={() => setPricingTypeId(pt.id)}
            className={cn(
              "rounded-xl border px-4 py-3 text-sm font-medium",
              chosenId === pt.id
                ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                : "border-border text-foreground-muted",
            )}
          >
            {pt.name}
            {pt.model === "HOURLY" && pt.hourlyRate ? ` · ฿${pt.hourlyRate}/hr` : ""}
          </button>
        ))}
      </div>
      {startPlaying.error && (
        <p className="text-sm text-status-danger">{startPlaying.error.message}</p>
      )}
      <Button
        disabled={!chosenId || startPlaying.isPending}
        onClick={() => chosenId && startPlaying.mutate({ sessionId, pricingTypeId: chosenId })}
      >
        {startPlaying.isPending ? "Starting…" : "Start Playing"}
      </Button>
    </Card>
  );
}
