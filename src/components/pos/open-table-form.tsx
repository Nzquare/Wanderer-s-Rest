"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function OpenTableForm({
  tableId,
  onOpened,
}: {
  tableId: string;
  onOpened: () => void;
}) {
  const [playerCount, setPlayerCount] = useState(1);
  const [pricingTypeId, setPricingTypeId] = useState<string | undefined>();
  // "No play yet" (§Start Playing) — customer is seated/ordering but
  // hasn't decided to play, so no pricing type is picked and no player
  // timer starts here. Table.tsx surfaces a "Start Playing" panel once
  // they do, which picks the price and starts every player's clock then.
  const [startPlaying, setStartPlaying] = useState(true);
  const { data: pricingTypes } = trpc.pricingTypes.list.useQuery();
  const utils = trpc.useUtils();

  const openTable = trpc.sessions.openTable.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.sessions.getTableDetail.invalidate({ tableId }),
        utils.sessions.listTables.invalidate(),
      ]);
      onOpened();
    },
  });

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-surface p-5">
      <div>
        <p className="text-sm font-medium text-foreground-muted">
          Number of players
        </p>
        <div className="mt-2 flex items-center gap-4">
          <button
            className="h-14 w-14 rounded-xl border border-border text-2xl font-semibold active:bg-black/5"
            onClick={() => setPlayerCount((c) => Math.max(1, c - 1))}
          >
            −
          </button>
          <span className="w-12 text-center text-3xl font-semibold tabular-nums">
            {playerCount}
          </span>
          <button
            className="h-14 w-14 rounded-xl border border-border text-2xl font-semibold active:bg-black/5"
            onClick={() => setPlayerCount((c) => Math.min(50, c + 1))}
          >
            +
          </button>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground-muted">Playing?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => setStartPlaying(true)}
            className={cn(
              "rounded-xl border px-4 py-3 text-sm font-medium",
              startPlaying
                ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                : "border-border text-foreground-muted",
            )}
          >
            Playing now
          </button>
          <button
            onClick={() => setStartPlaying(false)}
            className={cn(
              "rounded-xl border px-4 py-3 text-sm font-medium",
              !startPlaying
                ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                : "border-border text-foreground-muted",
            )}
          >
            No play yet
          </button>
        </div>
        {!startPlaying && (
          <p className="mt-2 text-xs text-foreground-muted">
            Seats the table with no timer running. Pick a price and start the
            timer later from the table page, once the customer wants to play.
          </p>
        )}
      </div>

      {startPlaying && (
        <div>
          <p className="text-sm font-medium text-foreground-muted">
            Pricing type
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pricingTypes?.map((pt) => (
              <button
                key={pt.id}
                onClick={() => setPricingTypeId(pt.id)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm font-medium",
                  (pricingTypeId ?? pricingTypes[0]?.id) === pt.id
                    ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                    : "border-border text-foreground-muted",
                )}
              >
                {pt.name}
                {pt.model === "HOURLY" && pt.hourlyRate
                  ? ` · ฿${pt.hourlyRate}/hr`
                  : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {openTable.error && (
        <p className="text-sm text-status-danger">{openTable.error.message}</p>
      )}

      <Button
        size="xl"
        className="w-full"
        disabled={openTable.isPending}
        onClick={() =>
          openTable.mutate({
            tableId,
            playerCount,
            startPlaying,
            pricingTypeId: startPlaying ? (pricingTypeId ?? pricingTypes?.[0]?.id) : undefined,
          })
        }
      >
        {openTable.isPending ? "Starting…" : startPlaying ? "Start Table" : "Seat Table (No Play Yet)"}
      </Button>
    </div>
  );
}
