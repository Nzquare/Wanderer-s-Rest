import { AchievementsManager } from "@/components/back-office/achievements-manager";

export default function AchievementsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Achievements</h1>
        <p className="text-sm text-foreground-muted">
          Automatic achievements unlock themselves at checkout. Manual ones
          must be created here before staff can award them (§30).
        </p>
      </div>
      <AchievementsManager />
    </div>
  );
}
