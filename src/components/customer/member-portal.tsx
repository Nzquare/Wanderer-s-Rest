"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { describeBenefit } from "@/lib/benefits";

type Benefit = {
  id: string;
  achievementNameEn: string | null;
  icon: string | null;
  label: string | null;
  promotionType: string | null;
  promotionValue: number | null;
  rewardMenuItemName: string | null;
  status: string;
  earnedAt: string | Date;
  usedAt?: string | Date | null;
};

/**
 * Benefits split into two tabs (§Benefits history) — "Benefits" is just
 * what's still claimable, so it doesn't get cluttered with everything
 * ever redeemed; "History" is where a used/expired one goes instead of
 * lingering in the claim list forever.
 */
function BenefitsCard({ benefits }: { benefits: Benefit[] }) {
  const [tab, setTab] = useState<"available" | "history">("available");
  const available = benefits.filter((b) => b.status === "AVAILABLE");
  const history = benefits.filter((b) => b.status !== "AVAILABLE");
  const shown = tab === "available" ? available : history;

  if (benefits.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/20 bg-white/5 p-5">
      <div className="flex gap-2">
        <button
          onClick={() => setTab("available")}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            tab === "available" ? "bg-teal-500 text-white" : "bg-white/10 text-white/70"
          }`}
        >
          Benefits ({available.length})
        </button>
        <button
          onClick={() => setTab("history")}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            tab === "history" ? "bg-teal-500 text-white" : "bg-white/10 text-white/70"
          }`}
        >
          History ({history.length})
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {shown.map((b) => (
          <div
            key={b.id}
            className={`rounded-lg p-2 text-sm ${
              tab === "available" ? "bg-teal-500/20" : "bg-white/5 opacity-60"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-white">
                {b.icon ?? "🎁"} {describeBenefit(b.promotionType, b.promotionValue, b.rewardMenuItemName)}
              </p>
              {tab === "available" ? (
                <span className="shrink-0 text-xs text-white/70">Show this to staff</span>
              ) : (
                <span className="shrink-0 text-xs text-white/70">
                  {b.status === "USED" ? "Redeemed" : "Expired"}
                </span>
              )}
            </div>
            <p className="text-xs text-white/50">
              From: {b.achievementNameEn ?? b.label ?? "the tavern"}
              {tab === "history" && b.usedAt && ` · ${new Date(b.usedAt).toLocaleDateString()}`}
            </p>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="text-sm text-white/60">
            {tab === "available" ? "Nothing to claim right now." : "No redeemed benefits yet."}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Fully public "check my profile" page (§Member self-service) — a member
 * types the phone number they registered with, no login. Read-only:
 * name, class, rank/level/EXP progress, achievements, visit count. Same
 * unauthenticated trust model as the table-ordering QR page (§16) — just
 * keyed by phone number instead of a table's qrToken.
 */
export function MemberPortal() {
  const [phone, setPhone] = useState("");
  const [submittedPhone, setSubmittedPhone] = useState<string | null>(null);

  const { data: profile, isLoading, error } = trpc.members.lookupByPhone.useQuery(
    { phone: submittedPhone ?? "" },
    { enabled: !!submittedPhone },
  );

  if (submittedPhone) {
    return (
      <div className="space-y-4">
        {isLoading && <p className="text-center text-white/70">Looking you up…</p>}
        {error && (
          <div className="space-y-3 rounded-2xl border border-white/20 bg-white/5 p-5 text-center">
            <p className="text-white/80">{error.message}</p>
            <button
              onClick={() => setSubmittedPhone(null)}
              className="text-sm text-teal-400 underline"
            >
              Try a different number
            </button>
          </div>
        )}
        {profile && (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-900 p-6 shadow-2xl shadow-black/40">
              {/* Decorative glow blobs — pure CSS, no assets. */}
              <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-teal-400/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-3xl" />

              <div className="relative">
                <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.3em] text-teal-300">
                  <span className="h-px w-6 bg-teal-400/40" />
                  Adventurer Profile
                  <span className="h-px w-6 bg-teal-400/40" />
                </div>

                <div className="mt-4 flex items-center gap-4">
                  {/* The class emoji as a proper decoration — a glowing
                      badge with the level overlapping its corner, like a
                      game HUD avatar (§Class emoji decoration). */}
                  <div className="relative shrink-0">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-teal-400/40 bg-white/10 text-3xl shadow-[0_0_20px_rgba(45,212,191,0.35)]">
                      {profile.classIcon || "🧑"}
                    </div>
                    {profile.progression && (
                      <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-brand-900 bg-teal-400 px-1.5 py-0.5 text-[10px] font-bold text-brand-950">
                        LV {profile.progression.totalLevel}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h1 className="truncate text-2xl font-bold text-white">
                      {profile.adventurerName}
                    </h1>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {profile.classNameEn && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs text-white/80">
                          {profile.classIcon} {profile.classNameEn}
                        </span>
                      )}
                      {profile.progression && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs text-white/80">
                          {profile.progression.rankIcon ?? "🎖️"} {profile.progression.rankName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {profile.progression && (
                  <div className="mt-5">
                    <div className="flex items-baseline justify-between text-xs text-white/60">
                      <span className="font-medium text-white/80">
                        Level {profile.progression.totalLevel} progress
                      </span>
                      <span>
                        {profile.progression.expIntoLevel} / {profile.progression.expForNextLevel} EXP
                      </span>
                    </div>
                    <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-white/10 ring-1 ring-inset ring-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-teal-400 to-cyan-300 shadow-[0_0_8px_rgba(45,212,191,0.6)] transition-all"
                        style={{
                          width: `${Math.min(100, Math.round((profile.progression.expIntoLevel / profile.progression.expForNextLevel) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-5 flex items-center gap-1.5 border-t border-white/10 pt-4 text-sm text-white/60">
                  <span>👣</span>
                  <span>{profile.visits} visits so far</span>
                </div>
              </div>
            </div>

            <BenefitsCard benefits={profile.benefits} />

            <div className="rounded-2xl border border-white/20 bg-white/5 p-5">
              <p className="font-medium text-white">
                Achievements ({profile.achievements.filter((a) => a.unlockedAt).length} /{" "}
                {profile.achievements.length})
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {profile.achievements
                  .slice()
                  .sort((a, b) => (a.unlockedAt && !b.unlockedAt ? -1 : !a.unlockedAt && b.unlockedAt ? 1 : 0))
                  .map((a) =>
                    a.unlockedAt ? (
                      <div key={a.id} className="rounded-lg bg-white/10 p-2 text-sm">
                        <p className="font-medium text-white">
                          {a.icon ?? "🏆"} {a.nameEn}
                        </p>
                        <p className="text-xs text-white/60">
                          {new Date(a.unlockedAt).toLocaleDateString()}
                        </p>
                      </div>
                    ) : (
                      <div
                        key={a.id}
                        className="rounded-lg border border-dashed border-white/20 bg-white/5 p-2 text-sm opacity-60"
                      >
                        {a.hidden ? (
                          <>
                            <p className="font-medium text-white/70">🔒 ???</p>
                            <p className="text-xs text-white/50">Secret</p>
                          </>
                        ) : (
                          <>
                            <p className="font-medium text-white/70">{a.icon} {a.nameEn}</p>
                            <p className="text-xs text-white/50">Not yet unlocked</p>
                          </>
                        )}
                      </div>
                    ),
                  )}
                {profile.achievements.length === 0 && (
                  <p className="col-span-2 text-sm text-white/60">Nothing to show yet.</p>
                )}
              </div>
            </div>

            <button
              onClick={() => setSubmittedPhone(null)}
              className="w-full text-center text-sm text-teal-400 underline"
            >
              Check a different number
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-white/20 bg-white/5 p-5">
      <p className="text-center text-white/80">
        Enter the phone number you registered with to see your level, rank,
        and achievements.
      </p>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && phone.trim() && setSubmittedPhone(phone.trim())}
        placeholder="e.g. 0812345678"
        className="h-12 w-full rounded-xl border border-white/20 bg-white/10 px-4 text-center text-lg text-white outline-none placeholder:text-white/40 focus:border-teal-400"
      />
      <button
        disabled={!phone.trim()}
        onClick={() => setSubmittedPhone(phone.trim())}
        className="h-12 w-full rounded-xl bg-teal-500 font-medium text-white disabled:opacity-40"
      >
        Check my profile
      </button>
    </div>
  );
}
