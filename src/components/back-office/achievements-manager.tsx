"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleButton } from "@/components/ui/toggle-button";

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

const AUTO_TRIGGERS = [
  { value: "VISIT_COUNT", label: "Visit count", field: "count" },
  { value: "LEVEL_REACHED", label: "Level reached", field: "level" },
  { value: "RANK_REACHED", label: "Rank order reached", field: "rankOrder" },
  { value: "LIFETIME_SPEND", label: "Lifetime spend (฿)", field: "amount" },
] as const;

export function AchievementsManager() {
  const { data: achievements } = trpc.achievements.list.useQuery();
  const utils = trpc.useUtils();
  const toggleActive = trpc.achievements.update.useMutation({
    onSuccess: () => utils.achievements.list.invalidate(),
  });

  const [nameEn, setNameEn] = useState("");
  const [nameTh, setNameTh] = useState("");
  const [code, setCode] = useState("");
  const [icon, setIcon] = useState("🏆");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("VISITS");
  const [type, setType] = useState<"AUTOMATIC" | "MANUAL">("MANUAL");
  const [triggerType, setTriggerType] = useState<(typeof AUTO_TRIGGERS)[number]["value"]>(
    "VISIT_COUNT",
  );
  const [triggerValue, setTriggerValue] = useState("");
  const [hasReward, setHasReward] = useState(false);
  const [benefitValue, setBenefitValue] = useState("");

  const create = trpc.achievements.create.useMutation({
    onSuccess: async () => {
      setNameEn("");
      setNameTh("");
      setCode("");
      setTriggerValue("");
      setBenefitValue("");
      await utils.achievements.list.invalidate();
      await utils.achievements.listManualAwardable.invalidate();
    },
  });

  const triggerField = AUTO_TRIGGERS.find((t) => t.value === triggerType)?.field ?? "count";

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="font-medium text-foreground">New achievement</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-16">
            <label className="text-xs text-foreground-muted">Icon</label>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-center text-lg"
            />
          </div>
          <div className="w-32">
            <label className="text-xs text-foreground-muted">Code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="TAVERN_REGULAR"
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
            />
          </div>
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
          <div className="w-36">
            <label className="text-xs text-foreground-muted">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
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
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="MANUAL">Manual</option>
              <option value="AUTOMATIC">Automatic</option>
            </select>
          </div>
        </div>

        {type === "AUTOMATIC" && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg bg-background p-2">
            <div className="w-48">
              <label className="text-xs text-foreground-muted">Trigger</label>
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value as typeof triggerType)}
                className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm"
              >
                {AUTO_TRIGGERS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className="text-xs text-foreground-muted">Threshold</label>
              <input
                type="number"
                value={triggerValue}
                onChange={(e) => setTriggerValue(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-2 text-sm text-foreground-muted">
            <input
              type="checkbox"
              checked={hasReward}
              onChange={(e) => setHasReward(e.target.checked)}
            />
            Grants a benefit
          </label>
          {hasReward && (
            <div className="w-32">
              <label className="text-xs text-foreground-muted">Benefit ฿ value</label>
              <input
                type="number"
                value={benefitValue}
                onChange={(e) => setBenefitValue(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
              />
            </div>
          )}
        </div>

        {create.error && (
          <p className="text-xs text-status-danger">{create.error.message}</p>
        )}
        <Button
          size="md"
          disabled={!nameEn || !nameTh || !code || create.isPending}
          onClick={() =>
            create.mutate({
              code,
              nameEn,
              nameTh,
              icon,
              category,
              type,
              triggerType: type === "AUTOMATIC" ? triggerType : undefined,
              triggerValue:
                type === "AUTOMATIC" && triggerValue
                  ? { [triggerField]: Number(triggerValue) }
                  : undefined,
              hasReward,
              benefitType: hasReward ? "FIXED_DISCOUNT" : undefined,
              benefitConfig: hasReward ? { value: Number(benefitValue) || 0 } : undefined,
            })
          }
        >
          Create achievement
        </Button>
      </Card>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {achievements?.map((a) => (
          <Card key={a.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">
                {a.icon} {a.nameEn}{" "}
                <span className="text-xs text-foreground-muted">({a.type})</span>
              </p>
              <p className="text-xs text-foreground-muted">
                {a.category}
                {a.hasReward ? " · has benefit" : ""}
              </p>
            </div>
            <ToggleButton
              on={a.active}
              onLabel="Active"
              offLabel="Inactive"
              onClick={() => toggleActive.mutate({ id: a.id, active: !a.active })}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}
