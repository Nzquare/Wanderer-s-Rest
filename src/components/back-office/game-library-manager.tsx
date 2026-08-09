"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: "bg-status-success/15 text-status-success",
  IN_USE: "bg-status-active/15 text-status-active",
  MISSING: "bg-status-warning/15 text-status-warning",
  DAMAGED: "bg-status-danger/15 text-status-danger",
  ARCHIVED: "bg-status-neutral/15 text-status-neutral",
};

function CreateGameForm() {
  const [nameEn, setNameEn] = useState("");
  const [nameTh, setNameTh] = useState("");
  const [category, setCategory] = useState("");
  const [cooperative, setCooperative] = useState(false);
  const [minPlayers, setMinPlayers] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.games.create.useMutation({
    onSuccess: async () => {
      setNameEn("");
      setNameTh("");
      setCategory("");
      setMinPlayers("");
      setMaxPlayers("");
      await utils.games.listAll.invalidate();
      await utils.games.listForRecording.invalidate();
    },
  });

  return (
    <Card className="flex flex-wrap items-end gap-2">
      <div className="w-40">
        <label className="text-xs text-foreground-muted">English name</label>
        <input
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
        />
      </div>
      <div className="w-40">
        <label className="text-xs text-foreground-muted">Thai name</label>
        <input
          value={nameTh}
          onChange={(e) => setNameTh(e.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
        />
      </div>
      <div className="w-32">
        <label className="text-xs text-foreground-muted">Category</label>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Strategy"
          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
        />
      </div>
      <div className="w-20">
        <label className="text-xs text-foreground-muted">Min players</label>
        <input
          type="number"
          value={minPlayers}
          onChange={(e) => setMinPlayers(e.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
        />
      </div>
      <div className="w-20">
        <label className="text-xs text-foreground-muted">Max players</label>
        <input
          type="number"
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(e.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
        />
      </div>
      <label className="flex items-center gap-1 text-xs text-foreground-muted">
        <input
          type="checkbox"
          checked={cooperative}
          onChange={(e) => setCooperative(e.target.checked)}
        />
        Cooperative
      </label>
      <Button
        size="md"
        disabled={!nameEn || !nameTh || create.isPending}
        onClick={() =>
          create.mutate({
            nameEn,
            nameTh,
            category: category || undefined,
            cooperative,
            minPlayers: minPlayers ? Number(minPlayers) : undefined,
            maxPlayers: maxPlayers ? Number(maxPlayers) : undefined,
          })
        }
      >
        Add game
      </Button>
    </Card>
  );
}

export function GameLibraryManager() {
  const { data: games } = trpc.games.listAll.useQuery();
  const utils = trpc.useUtils();
  const update = trpc.games.update.useMutation({
    onSuccess: () => {
      utils.games.listAll.invalidate();
      utils.games.listForRecording.invalidate();
    },
  });

  return (
    <div className="space-y-4">
      <CreateGameForm />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {games?.map((game) => (
          <Card key={game.id} className="space-y-2">
            <div>
              <p className="font-medium text-foreground">{game.nameEn}</p>
              <p className="text-xs text-foreground-muted">
                {game.category ?? "Uncategorized"}
                {game.cooperative ? " · Co-op" : ""}
                {game.minPlayers || game.maxPlayers
                  ? ` · ${game.minPlayers ?? "?"}-${game.maxPlayers ?? "?"} players`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {(["AVAILABLE", "IN_USE", "MISSING", "DAMAGED", "ARCHIVED"] as const).map(
                (status) => (
                  <button
                    key={status}
                    onClick={() => update.mutate({ id: game.id, status })}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      game.status === status
                        ? STATUS_STYLES[status]
                        : "bg-background text-foreground-muted",
                    )}
                  >
                    {status}
                  </button>
                ),
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
