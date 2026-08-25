"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleButton } from "@/components/ui/toggle-button";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { describeBenefit } from "@/lib/benefits";

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
  { value: "CLASS_LEVEL_REACHED", label: "Level reached in a class", field: "classAndLevel" },
  { value: "RANK_REACHED", label: "Rank order reached", field: "rankOrder" },
  { value: "LIFETIME_SPEND", label: "Lifetime spend (฿)", field: "amount" },
  { value: "UNIQUE_GAMES_COUNT", label: "Unique games played", field: "count" },
  { value: "TOTAL_GAMES_COUNT", label: "Total games played", field: "count" },
  { value: "CATEGORIES_PLAYED_COUNT", label: "Game categories played", field: "count" },
  { value: "SPECIFIC_GAME_PLAYED", label: "A specific game played", field: "gameId" },
  {
    value: "SPECIFIC_GAME_PLAY_COUNT",
    label: "A specific game played N times",
    field: "gameIdAndCount",
  },
] as const;
type TriggerType = (typeof AUTO_TRIGGERS)[number]["value"];

/**
 * Short hint shown under the trigger dropdown so the difference between the
 * three game-count triggers and the one game-picker trigger is obvious
 * without having to guess from the label alone.
 */
const TRIGGER_HINTS: Partial<Record<TriggerType, string>> = {
  CLASS_LEVEL_REACHED:
    "Unlocks once a member of the chosen class reaches this level — e.g. Level 21 Fighter unlocks \"Amateur Fighter\". A different class at the same level, or the right class below it, doesn't count.",
  UNIQUE_GAMES_COUNT:
    "Counts how many different games the member has played in total — any games, no need to pick which ones. Set the threshold below.",
  TOTAL_GAMES_COUNT:
    "Counts every play logged, including repeats of the same game. Set the threshold below.",
  CATEGORIES_PLAYED_COUNT:
    "Counts how many different game categories the member has played across (e.g. Strategy, Party) — any categories, no need to pick which ones. Set the threshold below.",
  SPECIFIC_GAME_PLAYED:
    "Unlocks the first time the member plays one exact game you pick below — unlike the counters above, this doesn't care how many games total they've played.",
  SPECIFIC_GAME_PLAY_COUNT:
    "Like 'A specific game played' but requires N plays of that one game, not just one — pick the game and set how many times below.",
};

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
  LEVEL: ["LEVEL_REACHED", "CLASS_LEVEL_REACHED"],
  RANK: ["RANK_REACHED"],
  GAMES: [
    "UNIQUE_GAMES_COUNT",
    "TOTAL_GAMES_COUNT",
    "CATEGORIES_PLAYED_COUNT",
    "SPECIFIC_GAME_PLAYED",
    "SPECIFIC_GAME_PLAY_COUNT",
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
  /** Only used by the "gameIdAndCount" field — triggerValue holds the count. */
  triggerGameId: string;
  triggerGameLabel: string;
  /** Only used by the "classAndLevel" field — triggerValue holds the level. */
  triggerClassId: string;
  hasReward: boolean;
  /** Which Promotion (Back Office → Promotions) this achievement grants. */
  promotionId: string;
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
  triggerGameId: "",
  triggerGameLabel: "",
  triggerClassId: "",
  hasReward: false,
  promotionId: "",
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
  const { data: classes } = trpc.classes.list.useQuery();

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
            {TRIGGER_HINTS[form.triggerType] && (
              <p className="mt-1 text-xs text-foreground-muted">{TRIGGER_HINTS[form.triggerType]}</p>
            )}
          </div>
          {triggerField === "gameId" && (
            <GamePicker
              value={form.triggerGameLabel}
              onChange={(gameId, label) =>
                setForm((f) => ({ ...f, triggerValue: gameId, triggerGameLabel: label }))
              }
            />
          )}
          {triggerField === "gameIdAndCount" && (
            <>
              <GamePicker
                value={form.triggerGameLabel}
                onChange={(gameId, label) =>
                  setForm((f) => ({ ...f, triggerGameId: gameId, triggerGameLabel: label }))
                }
              />
              <div className="w-24">
                <label className="text-xs text-foreground-muted">Times</label>
                <input
                  type="number"
                  min={1}
                  value={form.triggerValue}
                  onChange={(e) => setForm((f) => ({ ...f, triggerValue: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm"
                />
              </div>
            </>
          )}
          {triggerField === "classAndLevel" && (
            <>
              <div className="w-40">
                <label className="text-xs text-foreground-muted">Class</label>
                <select
                  value={form.triggerClassId}
                  onChange={(e) => setForm((f) => ({ ...f, triggerClassId: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm"
                >
                  <option value="">Choose a class…</option>
                  {classes?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon ?? ""} {c.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <label className="text-xs text-foreground-muted">Level</label>
                <input
                  type="number"
                  min={1}
                  value={form.triggerValue}
                  onChange={(e) => setForm((f) => ({ ...f, triggerValue: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm"
                />
              </div>
            </>
          )}
          {triggerField !== "gameId" &&
            triggerField !== "gameIdAndCount" &&
            triggerField !== "classAndLevel" && (
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
      </div>

      {form.hasReward && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-background p-2">
          <PromotionPicker
            value={form.promotionId}
            onChange={(promotionId) => setForm((f) => ({ ...f, promotionId }))}
          />
        </div>
      )}
    </>
  );
}

/**
 * Picks which existing Promotion (Back Office → Promotions) this
 * achievement grants — reused rather than configured inline (§Benefits),
 * so redeeming it is just applying that promotion at checkout.
 */
function PromotionPicker({ value, onChange }: { value: string; onChange: (promotionId: string) => void }) {
  const { data: promotions } = trpc.promotions.listActive.useQuery();
  return (
    <div className="w-64">
      <label className="text-xs text-foreground-muted">Promotion to grant</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm"
      >
        <option value="">Choose a promotion…</option>
        {promotions?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {describeBenefit(p.type, p.value, p.rewardMenuItemName)}
          </option>
        ))}
      </select>
      {promotions?.length === 0 && (
        <p className="mt-1 text-xs text-foreground-muted">
          No promotions yet — add one in Back Office → Promotions first.
        </p>
      )}
    </div>
  );
}

/** Short "· has benefit — ..." suffix for the collapsed card, so the list
 * shows what kind of reward each achievement grants without opening Edit. */
function benefitSummary(promotion: {
  name: string;
  type: string;
  value: number;
  rewardMenuItem: { nameEn: string } | null;
} | null): string {
  if (!promotion) return "has benefit — no promotion chosen";
  return `${promotion.name}: ${describeBenefit(promotion.type, promotion.value, promotion.rewardMenuItem?.nameEn)}`;
}

function buildPayload(form: FormState) {
  const triggerField = AUTO_TRIGGERS.find((t) => t.value === form.triggerType)?.field ?? "count";
  let triggerValue: Record<string, string | number> | undefined;
  if (form.type === "AUTOMATIC") {
    if (triggerField === "gameId" && form.triggerValue) {
      triggerValue = { gameId: form.triggerValue };
    } else if (triggerField === "gameIdAndCount" && form.triggerGameId && form.triggerValue) {
      triggerValue = { gameId: form.triggerGameId, count: Number(form.triggerValue) };
    } else if (triggerField === "classAndLevel" && form.triggerClassId && form.triggerValue) {
      triggerValue = { classId: form.triggerClassId, level: Number(form.triggerValue) };
    } else if (
      triggerField !== "gameId" &&
      triggerField !== "gameIdAndCount" &&
      triggerField !== "classAndLevel" &&
      form.triggerValue
    ) {
      triggerValue = { [triggerField]: Number(form.triggerValue) };
    }
  }
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
    // null (not undefined) when hasReward is off — undefined tells
    // achievements.update "leave promotionId as it is", which used to
    // leave a stale link in place any time someone unchecked "Has
    // reward" without separately clearing the promotion picker: the
    // achievement then showed as having no reward at all (the picker
    // itself is hidden whenever hasReward is off, so there was no way to
    // even see the leftover selection), while Promotion still counted it
    // as a live grantedByAchievements link and refused to be deleted —
    // "remove it from that achievement first" pointing at an achievement
    // that looked, from the Back Office list, like it wasn't involved at
    // all (§no achievement tied to it). null actually clears it.
    promotionId: form.hasReward ? form.promotionId || undefined : null,
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
    promotion: {
      id: string;
      name: string;
      type: string;
      value: number;
      rewardMenuItem: { nameEn: string } | null;
    } | null;
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
      triggerValue:
        field === "gameId"
          ? String(tv.gameId ?? "")
          : field === "gameIdAndCount"
            ? String(tv.count ?? "")
            : field === "classAndLevel"
              ? String(tv.level ?? "")
              : String(tv[field] ?? ""),
      triggerGameId: field === "gameIdAndCount" ? String(tv.gameId ?? "") : "",
      triggerGameLabel: "",
      triggerClassId: field === "classAndLevel" ? String(tv.classId ?? "") : "",
      hasReward: achievement.hasReward,
      promotionId: achievement.promotion?.id ?? "",
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
          {achievement.hasReward ? ` · ${benefitSummary(achievement.promotion)}` : ""}
          {achievement.hidden ? " · secret" : ""}
        </p>
        {/* hasReward off but a promotion link is still on the row underneath
            (a stale link from before this was cleared properly — see
            buildPayload) — otherwise invisible here since the line above
            only shows a promotion when hasReward is on, yet Promotion
            still counts it as a live grantedByAchievements link and
            refuses to be deleted, pointing back at an achievement that
            looks, from this list, like it isn't involved at all. Open Edit
            and Save (hasReward can stay off) to clear it. */}
        {!achievement.hasReward && achievement.promotion && (
          <p className="text-xs text-status-warning">
            ⚠ still linked to &quot;{achievement.promotion.name}&quot; even though Has reward is
            off — open Edit and Save to clear it.
          </p>
        )}
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
