import { RanksManager } from "@/components/back-office/ranks-manager";

export default function RanksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Ranks</h1>
        <p className="text-sm text-foreground-muted">
          The membership rank ladder (§28) — Beginner through Legendary out
          of the box, plus whatever tiers the café wants. Members climb it
          automatically as they earn EXP; use a member&apos;s profile to
          move one of them to a different rank directly.
        </p>
      </div>
      <RanksManager />
    </div>
  );
}
