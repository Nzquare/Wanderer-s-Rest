import { GameLibraryManager } from "@/components/back-office/game-library-manager";

export default function GamesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Game Library</h1>
        <p className="text-sm text-foreground-muted">
          Simple quantity-based tracking — no per-copy IDs (§34).
        </p>
      </div>
      <GameLibraryManager />
    </div>
  );
}
