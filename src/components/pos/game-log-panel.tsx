"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

export function GameLogPanel({ sessionId }: { sessionId: string }) {
  const [query, setQuery] = useState("");
  const utils = trpc.useUtils();
  const { data: played } = trpc.games.listForSession.useQuery({ sessionId });
  const { data: results } = trpc.games.listForRecording.useQuery(
    { query },
    { enabled: query.trim().length > 0 },
  );

  const invalidate = () => utils.games.listForSession.invalidate({ sessionId });
  const record = trpc.games.recordPlay.useMutation({
    onSuccess: () => {
      setQuery("");
      invalidate();
    },
  });
  const remove = trpc.games.removePlay.useMutation({ onSuccess: invalidate });

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm font-medium text-foreground-muted">
        Games played ({played?.length ?? 0})
      </p>
      {played?.map((gs) => (
        <div
          key={gs.id}
          className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm"
        >
          <span className="text-foreground">
            {gs.game?.nameEn ?? "Deleted game"}
            {gs.game?.category ? ` · ${gs.game.category.nameEn}` : ""}
          </span>
          <button
            onClick={() => remove.mutate({ gameSessionId: gs.id })}
            className="text-xs text-status-danger underline"
          >
            Remove
          </button>
        </div>
      ))}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search game to record…"
        className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-teal-500"
      />
      {query.trim() && (
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {results?.map((g) => (
            <button
              key={g.id}
              onClick={() => record.mutate({ sessionId, gameId: g.id })}
              disabled={record.isPending}
              className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-black/5"
            >
              <span>{g.nameEn}</span>
              <span className="text-foreground-muted">{g.category?.nameEn}</span>
            </button>
          ))}
          {results?.length === 0 && (
            <p className="px-2 py-1 text-sm text-foreground-muted">
              No games match — add it in Back Office → Game Library.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
