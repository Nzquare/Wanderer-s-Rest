"use client";

import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc/client";
import type { AppRouter } from "@/server/trpc/routers/_app";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleButton } from "@/components/ui/toggle-button";
import { ExcelImportButton } from "./excel-import-button";
import { cn } from "@/lib/cn";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type GameListItem = RouterOutputs["games"]["listAll"][number];

// ------------------------------------------------------------------------
// Categories — a managed list instead of free text (§34).
// ------------------------------------------------------------------------

type GameCategory = {
  id: string;
  nameTh: string;
  nameEn: string;
  active: boolean;
  _count: { games: number };
};

function CategoryRow({ category }: { category: GameCategory }) {
  const utils = trpc.useUtils();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const invalidate = () =>
    Promise.all([
      utils.games.listCategories.invalidate(),
      utils.games.listAll.invalidate(),
      utils.games.listForRecording.invalidate(),
    ]);
  const update = trpc.games.updateCategory.useMutation({ onSuccess: invalidate });
  const remove = trpc.games.deleteCategory.useMutation({
    onSuccess: async () => {
      setConfirmingDelete(false);
      await invalidate();
    },
  });

  return (
    <Card className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-medium text-foreground">{category.nameEn}</p>
        <p className="text-xs text-foreground-muted">
          {category._count.games} game{category._count.games === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleButton
          on={category.active}
          onLabel="Active"
          offLabel="Inactive"
          onClick={() => update.mutate({ id: category.id, active: !category.active })}
        />
        {confirmingDelete ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-status-danger">Delete?</span>
            <button
              disabled={remove.isPending}
              onClick={() => remove.mutate({ id: category.id })}
              className="font-medium text-status-danger underline"
            >
              Confirm
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="text-foreground-muted underline">
              Cancel
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirmingDelete(true)} className="text-xs text-status-danger underline">
            Delete
          </button>
        )}
      </div>
      {remove.error && confirmingDelete && (
        <p className="w-full text-xs text-status-danger">{remove.error.message}</p>
      )}
    </Card>
  );
}

function CreateCategoryForm() {
  const [nameEn, setNameEn] = useState("");
  const [nameTh, setNameTh] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.games.createCategory.useMutation({
    onSuccess: async () => {
      setNameEn("");
      setNameTh("");
      await utils.games.listCategories.invalidate();
    },
  });
  return (
    <Card className="flex flex-wrap items-end gap-2">
      <div className="w-40">
        <label className="text-xs text-foreground-muted">English name</label>
        <input
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
          placeholder="Strategy"
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
      {create.error && <p className="w-full text-xs text-status-danger">{create.error.message}</p>}
      <Button
        size="md"
        variant="outline"
        disabled={!nameEn || !nameTh || create.isPending}
        onClick={() => create.mutate({ nameEn, nameTh })}
      >
        Add category
      </Button>
    </Card>
  );
}

// ------------------------------------------------------------------------
// Games
// ------------------------------------------------------------------------

function CreateGameForm({ categories }: { categories: GameCategory[] }) {
  const [nameEn, setNameEn] = useState("");
  const [nameTh, setNameTh] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [minPlayers, setMinPlayers] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.games.create.useMutation({
    onSuccess: async () => {
      setNameEn("");
      setNameTh("");
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
      <div className="w-40">
        <label className="text-xs text-foreground-muted">Category</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameEn}
            </option>
          ))}
        </select>
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
      <Button
        size="md"
        disabled={!nameEn || !nameTh || create.isPending}
        onClick={() =>
          create.mutate({
            nameEn,
            nameTh,
            categoryId: categoryId || undefined,
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

/** One row per game — a compact list (same visual pattern as the Menu items
 * list) reads faster than a card grid once the library grows past a
 * handful of titles. */
function GameRow({ game, categories }: { game: GameListItem; categories: GameCategory[] }) {
  const utils = trpc.useUtils();
  const update = trpc.games.update.useMutation({
    onSuccess: () => {
      utils.games.listAll.invalidate();
      utils.games.listForRecording.invalidate();
    },
  });

  const details = [
    game.minPlayers || game.maxPlayers
      ? `${game.minPlayers ?? "?"}-${game.maxPlayers ?? "?"} players`
      : null,
    game.genre,
    game.estimatedMinutes ? `${game.estimatedMinutes} min` : null,
    game.totalQuantity > 1 ? `${game.totalQuantity} copies` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{game.nameEn}</p>
        <p className="text-xs text-foreground-muted">{details || "No details set"}</p>
      </div>
      <select
        value={game.categoryId ?? ""}
        onChange={(e) => update.mutate({ id: game.id, categoryId: e.target.value || null })}
        className="h-9 w-44 rounded-lg border border-border bg-surface px-2 text-xs"
      >
        <option value="">No category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nameEn}
          </option>
        ))}
      </select>
    </div>
  );
}

export function GameLibraryManager() {
  const [tab, setTab] = useState<"games" | "categories">("games");
  const { data: games } = trpc.games.listAll.useQuery();
  const { data: categories } = trpc.games.listCategories.useQuery();
  const utils = trpc.useUtils();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTab("games")}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium",
              tab === "games" ? "bg-teal-500/15 text-teal-700 dark:text-teal-300" : "text-foreground-muted",
            )}
          >
            Games
          </button>
          <button
            onClick={() => setTab("categories")}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium",
              tab === "categories" ? "bg-teal-500/15 text-teal-700 dark:text-teal-300" : "text-foreground-muted",
            )}
          >
            Categories
          </button>
        </div>
        {tab === "games" && (
          <ExcelImportButton
            importUrl="/api/games/import"
            templateUrl="/api/games/import-template"
            onImported={() =>
              Promise.all([
                utils.games.listAll.invalidate(),
                utils.games.listCategories.invalidate(),
                utils.games.listForRecording.invalidate(),
              ])
            }
            summaryLabels={[
              { key: "createdCategories", label: "Categories added" },
              { key: "createdGames", label: "Games added" },
              { key: "updatedGames", label: "Games updated" },
            ]}
          />
        )}
      </div>

      {tab === "games" ? (
        <div className="space-y-4">
          <CreateGameForm categories={categories ?? []} />
          <Card className="space-y-1">
            {games?.map((game) => (
              <GameRow key={game.id} game={game} categories={categories ?? []} />
            ))}
            {games?.length === 0 && (
              <p className="text-sm text-foreground-muted">No games yet — add one above.</p>
            )}
          </Card>
        </div>
      ) : (
        <div className="space-y-3">
          <CreateCategoryForm />
          {categories?.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
          {categories?.length === 0 && (
            <p className="text-sm text-foreground-muted">No categories yet — add one above.</p>
          )}
        </div>
      )}
    </div>
  );
}
