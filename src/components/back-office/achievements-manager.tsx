"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleButton } from "@/components/ui/toggle-button";
import { EmojiPicker } from "@/components/ui/emoji-picker";

const CATEGORIES = [
  "VISITS",
  "GAMES",
  "SPENDING",
  "LEVEL",
  "RANK",
  "EVENTS",
  "SOCIAL",
  "SECRET",
  "SPECIAL",
] as const;
type Category = (typeof CATEGORIES)[number];

const AUTO_TRIGGERS = [
  { value: "VISIT_COUNT", label: "Visit count", field: "count" },
  { value: "LEVEL_REACHED", label: "Level reached", field: "level" },
  { value: "RANK_REACHED", label: "Rank order reached", field: "rankOrder" },
  { value: "LIFETIME_SPEND", label: "Lifetime spend (฿)", field: "amount" },
  { value: "UNIQUE_GAMES_COUNT", label: "Unique games played", field: "count" },
  { value: "TOTAL_GAMES_COUNT", label: "Total games played", field: "count" },
  { value: "COOP_GAMES_COUNT", label: "Cooperative games played", field: "count" },
  { value: "CATEGORIES_PLAYED_COUNT", label: "Game categories played", field: "count" },
  { value: "SPECIFIC_GAME_PLAYED", label: "A specific game played", field: "gameId" },
] as const;
type TriggerType = (typeof AUTO_TRIGGERS)[number]["value"];

/**
 * Links each category to the trigger types that actually make sense for
 * it — picking "Spending" only offers a spend threshold, "Rank" only a
 * rank threshold, etc., instead of showing every trigger regardless of
 * category. Categories without an obvious 1:1 trigger (Events, Social,
 * Special, Secret — these are more often manual awards, or the "secret"
 * bit is really the Hidden toggle, orthogonal to category) leave every
 * trigger available.
 */
const CATEGORY_TRIGGER_TYPES: Partial<Record<Category, TriggerType[]>> = {
  VISITS: ["VISIT_COUNT"],
  SPENDING: ["LIFETIME_SPEND"],
  LEVEL: ["LEVEL_REACHED"],
  RANK: ["RANK_REACHED"],
  GAMES: [
    "UNIQUE_GAMES_COUNT",
    "TOTAL_GAMES_COUNT",
    "COOP_GAMES_COUNT",
    "CATEGORIES_PLAYED_COUNT",
    "SPECIFIC_GAME_PLAYED",
  ],
};

function triggersForCategory(category: Category): typeof AUTO_TRIGGERS[number][] {
  const allowed = CATEGORY_TRIGGER_TYPES[category];
  return allowed ? AUTO_TRIGGERS.filter((t) => allowed.includes(t.value)) : [...AUTO_TRIGGERS];
}

function GamePicker({ value, onChange }: { value: string; onChange: (gameId: string, label: string) => void }) {
  const [query, setQuery] = useState("");
  const { data: results } = trpc.games.listForRecording.useQuery(
    { query },
    { enabled: query.trim().length > 0 },
  );
  return (
    <div className="w-56">
      <label className="text-xs text-foreground-muted">Game</label>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={value || "Search game…"}
        className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm"
      />
      {query.trim() && (
        <div className="mt-1 max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-surface p-1">
          {results?.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                onChange(g.id, g.nameEn);
                setQuery("");
              }}
              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-black/5"
            >
              {g.nameEn}
            </button>
          ))}
          {results?.length === 0 && (
            <p className="px-2 py-1 text-xs text-foreground-muted">No games match.</p>
          )}
        </div>
      )}
    </div>
  );
}

interface FormState {
  nameEn: string;
  nameTh: string;
  code: string;
  icon: string;
  category: Category;
  type: "AUTOMATIC" | "MANUAL";
  triggerType: TriggerType;
  triggerValue: string;
  triggerGameLabel: string;
  hasReward: boolean;
  benefitValue: string;
  hidden: boolean;
}

const BLANK_FORM: FormState = {
  nameEn: "",
  nameTh: "",
  code: "",
  icon: "🏆",
  category: "VISITS",
  type: "MANUAL",
  triggerType: "VISIT_COUNT",
  triggerValue: "",
  triggerGameLabel: "",
  hasReward: false,
  benefitValue: "",
  hidden: false,
};

/** Shared field set for both creating and editing an achievement. */
function AchievementFields({
  form,
  setForm,
  showCode,
}: {
  form: FormState;
  setForm: (updater: (f: FormState) => FormState) => void;
  showCode: boolean;
}) {
  const availableTriggers = triggersForCategory(form.category);
  const triggerField = AUTO_TRIGGERS.find((t) => t.value === form.triggerType)?.field ?? "count";

  function setCategory(category: Category) {
    setForm((f) => {
      const stillValid = triggersForCategory(category).some((t) => t.value === f.triggerType);
      return { ...f, category, triggerType: stillValid ? f.triggerType : triggersForCategory(category)[0].value };
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-16">
          <label className="text-xs text-foreground-muted">Icon</label>
          <EmojiPicker value={form.icon} onChange={(icon) => setForm((f) => ({ ...f, icon }))} />
        </div>
        {showCode && (
          <div className="w-32">
            <label className="text-xs text-foreground-muted">Code</label>
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="TAVERN_REGULAR"
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
            />
          </div>
        )}
        <div className="w-40">
          <label className="text-xs text-foreground-muted">English name</label>
          <input
            value={form.nameEn}
            onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          />
        </div>
        <div className="w-40">
          <label className="text-xs text-foreground-muted">Thai name</label>
          <input
            value={form.nameTh}
            onChange={(e) => setForm((f) => ({ ...f, nameTh: e.target.value }))}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          />
        </div>
        <div className="w-36">
          <label className="text-xs text-foreground-muted">Category</label>
          <select
            value={form.category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <label className="text-xs text-foreground-muted">Type</label>
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as FormState["type"] }))}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="MANUAL">Manual</option>
            <option value="AUTOMATIC">Automatic</option>
          </select>
        </div>
      </div>

      {form.type === "AUTOMATIC" && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-background p-2">
          <div className="w-56">
            <label className="text-xs text-foreground-muted">
              Trigger — {form.category} achievements
            </label>
            <select
              value={form.triggerType}
              onChange={(e) => setForm((f) => ({ ...f, triggerType: e.target.value as TriggerType }))}
              className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm"
            >
              {availableTriggers.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {triggerField === "gameId" ? (
            <GamePicker
              value={form.triggerGameLabel}
              onChange={(gameId, label) =>
                setForm((f) => ({ ...f, triggerValue: gameId, triggerGameLabel: label }))
              }
            />
          ) : (
            <div className="w-28">
              <label className="text-xs text-foreground-muted">Threshold</label>
              <input
                type="number"
                value={form.triggerValue}
                onChange={(e) => setForm((f) => ({ ...f, triggerValue: e.target.value }))}
                className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm"
              />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <ToggleButton
          on={form.hidden}
          onLabel="Secret — hidden until unlocked"
          offLabel="Visible in the catalog"
          onClick={() => setForm((f) => ({ ...f, hidden: !f.hidden }))}
        />
        <label className="flex items-center gap-2 text-sm text-foreground-muted">
          <input
            type="checkbox"
            checked={form.hasReward}
            onChange={(e) => setForm((f) => ({ ...f, hasReward: e.target.checked }))}
          />
          Grants a benefit
        </label>
        {form.hasReward && (
          <div className="w-32">
            <label className="text-xs text-foreground-muted">Benefit ฿ value</label>
            <input
              type="number"
              value={form.benefitValue}
              onChange={(e) => setForm((f) => ({ ...f, benefitValue: e.target.value }))}
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
            />
          </div>
        )}
      </div>
    </>
  );
}

function buildPayload(form: FormState) {
  const triggerField = AUTO_TRIGGERS.find((t) => t.value === form.triggerType)?.field ?? "count";
  const triggerValue =
    form.type === "AUTOMATIC" && form.triggerValue
      ? { [triggerField]: triggerField === "gameId" ? form.triggerValue : Number(form.triggerValue) }
      : undefined;
  return {
    nameEn: form.nameEn,
    nameTh: form.nameTh,
    icon: form.icon,
    category: form.category,
    type: form.type,
    hidden: form.hidden,
    triggerType: form.type === "AUTOMATIC" ? form.triggerType : undefined,
    triggerValue,
    hasReward: form.hasReward,
    benefitType: form.hasReward ? ("FIXED_DISCOUNT" as const) : undefined,
    benefitConfig: form.hasReward ? { value: Number(form.benefitValue) || 0 } : undefined,
  };
}

function CreateAchievementCard() {
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const utils = trpc.useUtils();
  const create = trpc.achievements.create.useMutation({
    onSuccess: async () => {
      setForm(BLANK_FORM);
      await utils.achievements.list.invalidate();
      await utils.achievements.listManualAwardable.invalidate();
    },
  });

  return (
    <Card className="space-y-3">
      <p className="font-medium text-foreground">New achievement</p>
      <AchievementFields form={form} setForm={(u) => setForm(u)} showCode />
      {create.error && <p className="text-xs text-status-danger">{create.error.message}</p>}
      <Button
        size="md"
        disabled={!form.nameEn || !form.nameTh || !form.code || create.isPending}
        onClick={() => create.mutate({ code: form.code, ...buildPayload(form) })}
      >
        Create achievement
      </Button>
    </Card>
  );
}

function AchievementCard({
  achievement,
}: {
  achievement: {
    id: string;
    code: string;
    nameEn: string;
    nameTh: string;
    icon: string | null;
    category: Category;
    type: "AUTOMATIC" | "MANUAL";
    triggerType: string | null;
    triggerValue: unknown;
    hasReward: boolean;
    active: boolean;
    hidden: boolean;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const utils = trpc.useUtils();
  const invalidate = () =>
    Promise.all([
      utils.achievements.list.invalidate(),
      utils.achievements.listManualAwardable.invalidate(),
    ]);
  const update = trpc.achievements.update.useMutation({
    onSuccess: async () => {
      setEditing(false);
      await invalidate();
    },
  });
  const toggle = trpc.achievements.update.useMutation({ onSuccess: invalidate });
  const remove = trpc.achievements.delete.useMutation({
    onSuccess: async () => {
      setConfirmingDelete(false);
      await invalidate();
    },
  });

  const [form, setForm] = useState<FormState>(() => {
    const tv = (achievement.triggerValue ?? {}) as Record<string, unknown>;
    const triggerType = (achievement.triggerType as TriggerType) ?? "VISIT_COUNT";
    const field = AUTO_TRIGGERS.find((t) => t.value === triggerType)?.field ?? "count";
    return {
      nameEn: achievement.nameEn,
      nameTh: achievement.nameTh,
      code: achievement.code,
      icon: achievement.icon ?? "🏆",
      category: achievement.category,
      type: achievement.type,
      triggerType,
      triggerValue: field === "gameId" ? String(tv[field] ?? "") : String(tv[field] ?? ""),
      triggerGameLabel: "",
      hasReward: achievement.hasReward,
      benefitValue: "",
      hidden: achievement.hidden,
    };
  });

  if (editing) {
    return (
      <Card className="space-y-3">
        <p className="font-medium text-foreground">Edit achievement</p>
        <AchievementFields form={form} setForm={(u) => setForm(u)} showCode={false} />
        {update.error && <p className="text-xs text-status-danger">{update.error.message}</p>}
        <div className="flex gap-2">
          <Button
            size="md"
            disabled={!form.nameEn || !form.nameTh || update.isPending}
            onClick={() => update.mutate({ id: achievement.id, ...buildPayload(form) })}
          >
            Save
          </Button>
          <Button size="md" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex items-center justify-between">
      <div>
        <p className="font-medium text-foreground">
          {achievement.icon} {achievement.nameEn}{" "}
          <span className="text-xs text-foreground-muted">({achievement.type})</span>
        </p>
        <p className="text-xs text-foreground-muted">
          {achievement.category}
          {achievement.hasReward ? " · has benefit" : ""}
          {achievement.hidden ? " · secret" : ""}
        </p>
        <div className="mt-1 flex flex-wrap gap-3 text-xs">
          <button onClick={() => setEditing(true)} className="text-teal-600 underline">
            Edit
          </button>
          {confirmingDelete ? (
            <span className="flex items-center gap-2">
              <span className="text-status-danger">Delete?</span>
              <button
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: achievement.id })}
                className="font-medium text-status-danger underline"
              >
                Confirm
              </button>
              <button onClick={() => setConfirmingDelete(false)} className="text-foreground-muted underline">
                Cancel
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmingDelete(true)} className="text-status-danger underline">
              Delete
            </button>
          )}
        </div>
        {remove.error && confirmingDelete && (
          <p className="mt-1 text-xs text-status-danger">{remove.error.message}</p>
        )}
      </div>
      <div className="flex gap-2">
        <ToggleButton
          on={achievement.hidden}
          onLabel="Secret"
          offLabel="Visible"
          onClick={() => toggle.mutate({ id: achievement.id, hidden: !achievement.hidden })}
        />
        <ToggleButton
          on={achievement.active}
          onLabel="Active"
          offLabel="Inactive"
          onClick={() => toggle.mutate({ id: achievement.id, active: !achievement.active })}
        />
      </div>
    </Card>
  );
}

export function AchievementsManager() {
  const { data: achievements } = trpc.achievements.list.useQuery();

  return (
    <div className="space-y-4">
      <CreateAchievementCard />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {achievements?.map((a) => (
          <AchievementCard key={a.id} achievement={a} />
        ))}
      </div>
    </div>
  );
}
