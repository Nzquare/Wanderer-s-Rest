"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function AdventurerProfile({ memberId }: { memberId: string }) {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.members.getProfile.useQuery({ memberId });
  const { data: classes } = trpc.members.listClasses.useQuery();
  const { data: manualAchievements } = trpc.achievements.listManualAwardable.useQuery();

  const [expAmount, setExpAmount] = useState("");
  const [expReason, setExpReason] = useState<"BONUS" | "EVENT" | "ADMIN_ADJUSTMENT" | "CORRECTION">(
    "ADMIN_ADJUSTMENT",
  );
  const [expNote, setExpNote] = useState("");
  const [awardAchievementId, setAwardAchievementId] = useState("");
  const [awardNote, setAwardNote] = useState("");

  const invalidate = () => utils.members.getProfile.invalidate({ memberId });
  const updateProfile = trpc.members.updateProfile.useMutation({ onSuccess: invalidate });
  const adjustExp = trpc.members.adjustExp.useMutation({
    onSuccess: () => {
      setExpAmount("");
      setExpNote("");
      invalidate();
    },
  });
  const awardAchievement = trpc.achievements.award.useMutation({
    onSuccess: () => {
      setAwardAchievementId("");
      setAwardNote("");
      invalidate();
    },
  });

  if (isLoading || !profile) {
    return <p className="text-sm text-foreground-muted">Loading adventurer profile…</p>;
  }

  const progress = profile.progression;
  const pct = progress ? Math.round((progress.expIntoLevel / progress.expForNextLevel) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Fantasy-styled header — this is the one place membership gets to show personality (§38, §48) */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-900 to-brand-700 p-6 text-white">
        <p className="text-xs uppercase tracking-[0.3em] text-teal-400">
          Adventurer Profile
        </p>
        <h1 className="mt-1 text-3xl font-bold">{profile.adventurerName}</h1>
        <p className="mt-1 text-white/70">
          {profile.class?.nameEn ?? "No class"} · {progress?.rankName ?? "Unranked"}
        </p>
        {progress && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-white/80">
              <span>LV {progress.totalLevel}</span>
              <span>
                {progress.expIntoLevel} / {progress.expForNextLevel} EXP
              </span>
            </div>
            <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-teal-400"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
        <div className="mt-4 flex gap-6 text-sm text-white/70">
          <span>{profile.visits} visits</span>
          <span>Lifetime EXP {profile.lifetimeExp}</span>
          <span>฿{profile.lifetimeSpending.toFixed(0)} spent</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="space-y-2">
          <p className="font-medium text-foreground">Achievements ({profile.achievements.length})</p>
          {profile.achievements.length === 0 && (
            <p className="text-sm text-foreground-muted">No achievements unlocked yet.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {profile.achievements.map((a) => (
              <div key={a.id} className="rounded-lg bg-background p-2 text-sm">
                <p className="font-medium text-foreground">
                  {a.achievement.icon ?? "🏆"} {a.achievement.nameEn}
                </p>
                <p className="text-xs text-foreground-muted">
                  {new Date(a.unlockedAt).toLocaleDateString()}
                  {a.benefit && a.benefit.status === "AVAILABLE" && " · Benefit available"}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-2">
          <p className="font-medium text-foreground">Recent EXP history</p>
          {profile.expHistory.length === 0 && (
            <p className="text-sm text-foreground-muted">No EXP recorded yet.</p>
          )}
          {profile.expHistory.map((h) => (
            <div key={h.id} className="flex justify-between text-sm">
              <span className="text-foreground-muted">
                {new Date(h.createdAt).toLocaleDateString()} · {h.reason}
              </span>
              <span className={h.amount >= 0 ? "text-status-success" : "text-status-danger"}>
                {h.amount >= 0 ? "+" : ""}
                {h.amount}
              </span>
            </div>
          ))}
        </Card>

        <Card className="space-y-3">
          <p className="font-medium text-foreground">Profile</p>
          <label className="block text-xs text-foreground-muted">
            Class
            <select
              defaultValue={profile.class?.id ?? ""}
              onChange={(e) =>
                updateProfile.mutate({ memberId, classId: e.target.value || null })
              }
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">No class</option>
              {classes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameEn}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-foreground-muted">
            Status
            <select
              defaultValue={profile.status}
              onChange={(e) =>
                updateProfile.mutate({
                  memberId,
                  status: e.target.value as "ACTIVE" | "INACTIVE" | "BANNED",
                })
              }
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="BANNED">Banned</option>
            </select>
          </label>
          <label className="block text-xs text-foreground-muted">
            Staff notes
            <textarea
              defaultValue={profile.staffNotes ?? ""}
              onBlur={(e) => updateProfile.mutate({ memberId, staffNotes: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"
            />
          </label>
        </Card>

        <Card className="space-y-2">
          <p className="font-medium text-foreground">Adjust EXP</p>
          <div className="flex flex-wrap items-end gap-2">
            <input
              type="number"
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              placeholder="± amount"
              className="h-10 w-28 rounded-lg border border-border bg-background px-2 text-sm"
            />
            <select
              value={expReason}
              onChange={(e) => setExpReason(e.target.value as typeof expReason)}
              className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="ADMIN_ADJUSTMENT">Admin adjustment</option>
              <option value="BONUS">Bonus</option>
              <option value="EVENT">Event</option>
              <option value="CORRECTION">Correction</option>
            </select>
            <input
              value={expNote}
              onChange={(e) => setExpNote(e.target.value)}
              placeholder="Note (optional)"
              className="h-10 flex-1 min-w-32 rounded-lg border border-border bg-background px-2 text-sm"
            />
            <Button
              size="md"
              disabled={!expAmount || adjustExp.isPending}
              onClick={() =>
                adjustExp.mutate({
                  memberId,
                  amount: Number(expAmount),
                  reason: expReason,
                  note: expNote || undefined,
                })
              }
            >
              Apply
            </Button>
          </div>

          <p className="pt-2 font-medium text-foreground">Award manual achievement</p>
          <div className="flex flex-wrap items-end gap-2">
            <select
              value={awardAchievementId}
              onChange={(e) => setAwardAchievementId(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">Choose achievement…</option>
              {manualAchievements?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nameEn}
                </option>
              ))}
            </select>
            <input
              value={awardNote}
              onChange={(e) => setAwardNote(e.target.value)}
              placeholder="Note (optional)"
              className="h-10 flex-1 min-w-32 rounded-lg border border-border bg-background px-2 text-sm"
            />
            {awardAchievement.error && (
              <p className="w-full text-xs text-status-danger">
                {awardAchievement.error.message}
              </p>
            )}
            <Button
              size="md"
              variant="outline"
              disabled={!awardAchievementId || awardAchievement.isPending}
              onClick={() =>
                awardAchievement.mutate({
                  memberId,
                  achievementId: awardAchievementId,
                  note: awardNote || undefined,
                })
              }
            >
              Award
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
