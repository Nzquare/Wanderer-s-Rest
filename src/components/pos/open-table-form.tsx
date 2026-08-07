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
            pricingTypeId: pricingTypeId ?? pricingTypes?.[0]?.id,
          })
        }
      >
        {openTable.isPending ? "Starting…" : "Start Table"}
      </Button>
    </div>
  );
}
