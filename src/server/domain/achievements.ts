/**
 * Automatic achievement evaluation (§30, §32, §56). Pure — takes a
 * snapshot of a member's current stats and the catalog of achievement
 * definitions, returns which ones just became satisfied. Manual
 * achievements are never evaluated here — staff award those directly
 * from a predefined list (§30).
 *
 * Game-based triggers (unique games played, cooperative games, etc.) are
 * defined but not yet evaluated — the Game Library (§34-37) that would
 * supply that data hasn't been built yet. Once it lands, re-running this
 * evaluator against real game stats retroactively unlocks anything earned
 * in the meantime; nothing here needs to change.
 */

export type TriggerType =
  | "VISIT_COUNT"
  | "LEVEL_REACHED"
  | "RANK_REACHED"
  | "LIFETIME_SPEND"
  | "UNIQUE_GAMES_COUNT"
  | "COOP_GAMES_COUNT"
  | "CATEGORY_GAMES_COUNT"
  | "CATEGORIES_PLAYED_COUNT"
  | "SPECIFIC_GAME_PLAYED"
  | "TOTAL_GAMES_COUNT"
  | "CUSTOM";

export interface MemberStatsForEvaluation {
  visits: number;
  totalLevel: number;
  rankOrder: number;
  lifetimeSpending: number;
  uniqueGamesCount?: number;
  totalGamesCount?: number;
  coopGamesCount?: number;
  categoriesPlayedCount?: number;
  specificGamesPlayed?: string[];
}

export interface AchievementDef {
  id: string;
  triggerType: TriggerType | null;
  triggerValue: unknown;
  repeatable: boolean;
}

function num(v: Record<string, unknown>, key: string): number {
  const raw = v[key];
  return typeof raw === "number" ? raw : Number(raw ?? 0);
}

export function isAchievementSatisfied(
  def: Pick<AchievementDef, "triggerType" | "triggerValue">,
  stats: MemberStatsForEvaluation,
): boolean {
  if (!def.triggerType) return false;
  const v = (def.triggerValue ?? {}) as Record<string, unknown>;
  switch (def.triggerType) {
    case "VISIT_COUNT":
      return stats.visits >= num(v, "count");
    case "LEVEL_REACHED":
      return stats.totalLevel >= num(v, "level");
    case "RANK_REACHED":
      return stats.rankOrder >= num(v, "rankOrder");
    case "LIFETIME_SPEND":
      return stats.lifetimeSpending >= num(v, "amount");
    case "UNIQUE_GAMES_COUNT":
      return (stats.uniqueGamesCount ?? 0) >= num(v, "count");
    case "TOTAL_GAMES_COUNT":
      return (stats.totalGamesCount ?? 0) >= num(v, "count");
    case "COOP_GAMES_COUNT":
      return (stats.coopGamesCount ?? 0) >= num(v, "count");
    case "CATEGORIES_PLAYED_COUNT":
      return (stats.categoriesPlayedCount ?? 0) >= num(v, "count");
    case "SPECIFIC_GAME_PLAYED":
      return (stats.specificGamesPlayed ?? []).includes(String(v.gameId ?? ""));
    // CATEGORY_GAMES_COUNT and CUSTOM need per-achievement logic beyond a
    // generic threshold check — not auto-evaluated in V1; award manually
    // or extend this switch when the need is concrete.
    default:
      return false;
  }
}

export function evaluateNewlyUnlocked<T extends AchievementDef>(
  defs: T[],
  alreadyUnlockedIds: Set<string>,
  stats: MemberStatsForEvaluation,
): T[] {
  return defs.filter((d) => {
    if (!d.repeatable && alreadyUnlockedIds.has(d.id)) return false;
    return isAchievementSatisfied(d, stats);
  });
}
