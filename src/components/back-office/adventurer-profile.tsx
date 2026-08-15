"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { describeBenefit } from "@/lib/benefits";

export function AdventurerProfile({ memberId }: { memberId: string }) {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.members.getProfile.useQuery({ memberId });
  const { data: classes } = trpc.classes.list.useQuery();
  const { data: ranks } = trpc.ranks.list.useQuery();
  const { data: manualAchievements } = trpc.achievements.listManualAwardable.useQuery();
  const { data: catalog } = trpc.achievements.list.useQuery();
  const { data: grantablePromotions } = trpc.promotions.listActive.useQuery();

  const [expAmount, setExpAmount] = useState("");
  const [expReason, setExpReason] = useState<"BONUS" | "EVENT" | "ADMIN_ADJUSTMENT" | "CORRECTION">(
    "ADMIN_ADJUSTMENT",
  );
  const [expNote, setExpNote] = useState("");
  const [rankId, setRankId] = useState("");
  const [rankNote, setRankNote] = useState("");
  const [awardAchievementId, setAwardAchievementId] = useState("");
  const [awardNote, setAwardNote] = useState("");
  const [grantPromotionId, setGrantPromotionId] = useState("");
  const [grantLabel, setGrantLabel] = useState("");

  const invalidate = () => utils.members.getProfile.invalidate({ memberId });
  const updateProfile = trpc.members.updateProfile.useMutation({ onSuccess: invalidate });
  const adjustExp = trpc.members.adjustExp.useMutation({
    onSuccess: () => {
      setExpAmount("");
      setExpNote("");
      invalidate();
    },
  });
  const setRank = trpc.members.setRank.useMutation({
    onSuccess: () => {
      setRankId("");
      setRankNote("");
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
  const redeemBenefit = trpc.benefits.redeem.useMutation({ onSuccess: invalidate });
  const grantBenefit = trpc.benefits.grant.useMutation({
    onSuccess: () => {
      setGrantPromotionId("");
      setGrantLabel("");
      invalidate();
    },
  });

  if (isLoading || !profile) {
    return <p className="text-sm text-foreground-muted">Loading adventurer profile…</p>;
  }

  const progress = profile.progression;
  const pct = progress ? Math.round((progress.expIntoLevel / progress.expForNextLevel) * 100) : 0;
  // What this member has actually earned to redeem — achievement-earned
  // and directly granted (§Direct benefit grants, e.g. a birthday reward)
  // alike, since every BenefitRedemption row looks the same to redeem
  // regardless of source.
  const benefits = profile.benefits;
  const availableBenefits = benefits.filter((b) => b.status === "AVAILABLE");

  return (
    <div className="space-y-6">
      {/* Fantasy-styled header — this is the one place membership gets to show personality (§38, §48) */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-900 to-brand-700 p-6 text-white">
        <p className="text-xs uppercase tracking-[0.3em] text-teal-400">
          Adventurer Profile
        </p>
        <h1 className="mt-1 text-3xl font-bold">{profile.adventurerName}</h1>
        <p className="mt-1 text-white/70">
          {profile.class ? `${profile.class.icon ?? ""} ${profile.class.nameEn}`.trim() : "No class"} ·{" "}
          {progress?.rankName ?? "Unranked"}
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

      {/* Full-width, above the grid — staff should never miss that a
          member walking up to the till has something to claim. Always
          shown (not just when benefits exist) so Grant benefit below is
          reachable for a member who has none yet. */}
      <Card className="space-y-2">
        <p className="font-medium text-foreground">
          Benefits {availableBenefits.length > 0 && `(${availableBenefits.length} to claim)`}
        </p>
        {benefits.length === 0 && (
          <p className="text-sm text-foreground-muted">None yet.</p>
        )}
        {benefits.length > 0 && (
          <div className="space-y-2">
            {benefits
              .slice()
              .sort((a, b) => (a.status === "AVAILABLE" && b.status !== "AVAILABLE" ? -1 : 0))
              .map((b) => (
                <div
                  key={b.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg p-2 text-sm ${
                    b.status === "AVAILABLE" ? "bg-teal-500/10" : "bg-background opacity-60"
                  }`}
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {b.icon ?? "🎁"}{" "}
                      {describeBenefit(
                        b.promotion.type,
                        b.promotion.value,
                        b.promotion.rewardMenuItem?.nameEn,
                      )}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      From: {b.achievementNameEn ?? b.label ?? "manual grant"}
                      {b.status === "AVAILABLE" &&
                        " · also redeemable at Checkout → Add promotion"}
                    </p>
                  </div>
                  {b.status === "AVAILABLE" ? (
                    <Button
                      size="md"
                      disabled={redeemBenefit.isPending}
                      onClick={() => redeemBenefit.mutate({ id: b.id })}
                    >
                      Mark redeemed
                    </Button>
                  ) : (
                    <span className="text-xs font-medium text-foreground-muted">
                      {b.status === "USED" ? "Redeemed" : "Expired"}
                    </span>
                  )}
                </div>
              ))}
          </div>
        )}
        {redeemBenefit.error && (
          <p className="text-xs text-status-danger">{redeemBenefit.error.message}</p>
        )}

        {/* Grant a benefit directly, no achievement involved (§Direct
            benefit grants) — a birthday reward or any other goodwill
            gesture that isn't earned through the achievement system. */}
        <div className="border-t border-border pt-2">
          <p className="text-sm font-medium text-foreground-muted">Grant benefit</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <select
              value={grantPromotionId}
              onChange={(e) => setGrantPromotionId(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">Choose a promotion…</option>
              {grantablePromotions?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} —{" "}
                  {describeBenefit(p.type, p.value, p.rewardMenuItemName)}
                </option>
              ))}
            </select>
            <input
              value={grantLabel}
              onChange={(e) => setGrantLabel(e.target.value)}
              placeholder="Reason (e.g. Birthday 2026)"
              className="h-10 flex-1 min-w-32 rounded-lg border border-border bg-background px-2 text-sm"
            />
            <Button
              size="md"
              variant="outline"
              disabled={!grantPromotionId || grantBenefit.isPending}
              onClick={() =>
                grantBenefit.mutate({
                  memberId,
                  promotionId: grantPromotionId,
                  label: grantLabel || undefined,
                })
              }
            >
              {grantBenefit.isPending ? "Granting…" : "Grant"}
            </Button>
          </div>
          {grantablePromotions?.length === 0 && (
            <p className="mt-1 text-xs text-foreground-muted">
              No active promotions yet — add one in Back Office → Promotions first.
            </p>
          )}
          {grantBenefit.error && (
            <p className="mt-1 text-xs text-status-danger">{grantBenefit.error.message}</p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <p className="font-medium text-foreground">Profile</p>
          <label className="block text-xs text-foreground-muted">
            Adventurer name
            <input
              defaultValue={profile.adventurerName}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value !== profile.adventurerName &&
                updateProfile.mutate({ memberId, adventurerName: e.target.value.trim() })
              }
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
            />
          </label>
          <label className="block text-xs text-foreground-muted">
            Phone
            <input
              defaultValue={profile.phone ?? ""}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value !== (profile.phone ?? "")) {
                  updateProfile.mutate({ memberId, phone: value || null });
                }
              }}
              placeholder="e.g. 0812345678"
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
            />
          </label>
          {updateProfile.error && (
            <p className="text-xs text-status-danger">{updateProfile.error.message}</p>
          )}
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
                  {c.icon ?? ""} {c.nameEn}
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
          {adjustExp.error && (
            <p className="text-xs text-status-danger">{adjustExp.error.message}</p>
          )}

          {/* Rank is normally derived from lifetime EXP (adjusted above) —
              this sets it directly by moving lifetimeExp to that rank's
              own minimum, recorded as an ordinary EXP adjustment, so it
              sticks instead of getting recomputed away on the next
              purchase (§Rank management). */}
          <p className="pt-2 font-medium text-foreground">Adjust Rank</p>
          <div className="flex flex-wrap items-end gap-2">
            <select
              value={rankId}
              onChange={(e) => setRankId(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">Choose rank…</option>
              {ranks?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.icon ?? "🎖️"} {r.nameEn}
                </option>
              ))}
            </select>
            <input
              value={rankNote}
              onChange={(e) => setRankNote(e.target.value)}
              placeholder="Note (optional)"
              className="h-10 flex-1 min-w-32 rounded-lg border border-border bg-background px-2 text-sm"
            />
            <Button
              size="md"
              variant="outline"
              disabled={!rankId || setRank.isPending}
              onClick={() =>
                setRank.mutate({ memberId, rankId, note: rankNote || undefined })
              }
            >
              {setRank.isPending ? "Setting…" : "Set rank"}
            </Button>
          </div>
          {setRank.error && (
            <p className="text-xs text-status-danger">{setRank.error.message}</p>
          )}

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

        <Card className="space-y-2">
          <p className="font-medium text-foreground">
            Achievements ({profile.achievements.length}
            {catalog ? ` / ${catalog.filter((c) => c.active).length}` : ""})
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(() => {
              const unlockedByAchievementId = new Map(
                profile.achievements.map((a) => [a.achievement.id, a]),
              );
              const all = catalog?.filter((c) => c.active) ?? [];
              // Unlocked first, then the rest — so what the adventurer has
              // actually earned reads before what's still ahead of them.
              const ordered = [
                ...all.filter((c) => unlockedByAchievementId.has(c.id)),
                ...all.filter((c) => !unlockedByAchievementId.has(c.id)),
              ];
              return ordered.map((achievement) => {
                const unlocked = unlockedByAchievementId.get(achievement.id);
                if (unlocked) {
                  return (
                    <div key={achievement.id} className="rounded-lg bg-background p-2 text-sm">
                      <p className="font-medium text-foreground">
                        {achievement.icon ?? "🏆"} {achievement.nameEn}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {new Date(unlocked.unlockedAt).toLocaleDateString()}
                        {unlocked.benefit && unlocked.benefit.status === "AVAILABLE" && " · Benefit available"}
                      </p>
                    </div>
                  );
                }
                // Not yet unlocked. Hidden/secret achievements (§32) don't
                // reveal what they are until earned — a locked "???" card
                // instead of the real name/description.
                if (achievement.hidden) {
                  return (
                    <div
                      key={achievement.id}
                      className="rounded-lg border border-dashed border-border bg-background/50 p-2 text-sm opacity-60"
                    >
                      <p className="font-medium text-foreground-muted">🔒 ???</p>
                      <p className="text-xs text-foreground-muted">Secret — not yet unlocked</p>
                    </div>
                  );
                }
                return (
                  <div
                    key={achievement.id}
                    className="rounded-lg border border-dashed border-border bg-background/50 p-2 text-sm opacity-60"
                  >
                    <p className="font-medium text-foreground-muted">
                      {achievement.icon ?? "🏆"} {achievement.nameEn}
                    </p>
                    <p className="text-xs text-foreground-muted">Not yet unlocked</p>
                  </div>
                );
              });
            })()}
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
      </div>
    </div>
  );
}
