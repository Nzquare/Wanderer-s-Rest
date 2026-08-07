/**
 * EXP / Level / Rank progression engine (§26–28, §56).
 * Lifetime EXP never resets — only the displayed "level within rank" cycles.
 * Rank tiers can have different level counts each (Rank.levelsRequired),
 * so progression is resolved by walking the ordered rank list rather than
 * a single global "levels per rank" divide.
 */

export function expFromSpending(
  eligibleSpending: number,
  bahtPerExp: number,
): number {
  if (bahtPerExp <= 0) return 0;
  return Math.floor(eligibleSpending / bahtPerExp);
}

export interface RankDef {
  order: number;
  levelsRequired: number;
}

export interface RankResolution<R extends RankDef> {
  rank: R;
  levelWithinRank: number;
}

/**
 * Walks the ordered rank list to find which rank `totalLevel` falls in.
 * The last configured rank absorbs all levels beyond it uncapped (so a
 * Legendary-rank member keeps leveling — LV21, LV22, ... — instead of
 * getting stuck at the top until Back Office adds another rank tier).
 */
export function resolveRank<R extends RankDef>(
  totalLevel: number,
  ranks: R[],
): RankResolution<R> {
  if (ranks.length === 0) {
    throw new Error("resolveRank: at least one rank must be configured");
  }
  const sorted = [...ranks].sort((a, b) => a.order - b.order);
  let remaining = totalLevel;
  for (let i = 0; i < sorted.length; i++) {
    const rank = sorted[i];
    const isLast = i === sorted.length - 1;
    if (isLast || remaining <= rank.levelsRequired) {
      return { rank, levelWithinRank: remaining };
    }
    remaining -= rank.levelsRequired;
  }
  // Unreachable, but keeps TypeScript happy.
  const last = sorted[sorted.length - 1];
  return { rank: last, levelWithinRank: remaining };
}

export interface ProgressionResult<R extends RankDef> {
  totalLevel: number;
  levelWithinRank: number;
  expIntoLevel: number;
  expForNextLevel: number;
  rank: R;
}

export function computeProgression<R extends RankDef>(
  lifetimeExp: number,
  expPerLevel: number,
  ranks: R[],
): ProgressionResult<R> {
  const safeExpPerLevel = Math.max(1, expPerLevel);
  const totalLevel = Math.floor(lifetimeExp / safeExpPerLevel) + 1;
  const expIntoLevel = lifetimeExp % safeExpPerLevel;
  const { rank, levelWithinRank } = resolveRank(totalLevel, ranks);
  return {
    totalLevel,
    levelWithinRank,
    expIntoLevel,
    expForNextLevel: safeExpPerLevel,
    rank,
  };
}
