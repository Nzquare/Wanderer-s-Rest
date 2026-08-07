/**
 * Table time pricing engine (§7). Pure functions — no I/O — so they're easy
 * to unit test and impossible to accidentally make depend on "now" outside
 * the caller's control (every function takes `now` explicitly).
 *
 * Grace period rule: a session gets `gracePeriodMinutes` of grace into the
 * next hour before being charged for it. With the default 15-minute grace:
 *   0h01m–1h15m  -> 1 hour
 *   1h16m–2h15m  -> 2 hours
 *   2h16m–3h15m  -> 3 hours
 * Daily cap: once the hourly fee would reach/exceed the cap, the cap
 * applies instead and never increases further.
 */

export type PlayerTimerStatus = "ACTIVE" | "PAUSED" | "STOPPED";

export interface PlayerTimeRecord {
  id: string;
  startTime: Date;
  pausedAt: Date | null;
  accumulatedPausedMs: number;
  endTime: Date | null;
  status: PlayerTimerStatus;
}

/** Milliseconds of billable (non-paused) time for one player, as of `now`. */
export function computePlayerBillableMs(
  player: PlayerTimeRecord,
  now: Date,
): number {
  const end = player.endTime ?? now;
  const ongoingPauseMs =
    player.status === "PAUSED" && player.pausedAt
      ? Math.max(0, now.getTime() - player.pausedAt.getTime())
      : 0;
  const raw =
    end.getTime() -
    player.startTime.getTime() -
    player.accumulatedPausedMs -
    ongoingPauseMs;
  return Math.max(0, raw);
}

/** Converts billable minutes into charged hours using the grace-period rule. */
export function minutesToChargedHours(
  minutes: number,
  gracePeriodMinutes: number,
): number {
  if (minutes <= 0) return 0;
  return Math.max(1, Math.ceil((minutes - gracePeriodMinutes) / 60));
}

export interface PricingTypeConfig {
  model: "HOURLY" | "FIXED" | "PACKAGE";
  hourlyRate: number | null;
  fixedPrice: number | null;
  perPerson: boolean;
  dailyCap: number | null;
  gracePeriodMinutes: number;
}

export interface TableFeeLine {
  playerId: string;
  billableMinutes: number;
  chargedHours: number;
  fee: number;
  cappedAtDailyCap: boolean;
}

export interface TableFeeResult {
  lines: TableFeeLine[];
  total: number;
}

function applyDailyCap(fee: number, dailyCap: number | null) {
  if (dailyCap != null && fee >= dailyCap) {
    return { fee: dailyCap, capped: true };
  }
  return { fee, capped: false };
}

export function computeTableFee(params: {
  pricingType: PricingTypeConfig;
  players: PlayerTimeRecord[];
  now?: Date;
  /** Required when pricingType.model === "PACKAGE" — the Package's price. */
  packagePrice?: number;
}): TableFeeResult {
  const now = params.now ?? new Date();
  const { pricingType, players } = params;

  if (pricingType.model === "PACKAGE" || pricingType.model === "FIXED") {
    const price =
      pricingType.model === "PACKAGE"
        ? (params.packagePrice ?? 0)
        : (pricingType.fixedPrice ?? 0);
    if (pricingType.perPerson) {
      const lines: TableFeeLine[] = players.map((p) => ({
        playerId: p.id,
        billableMinutes: 0,
        chargedHours: 0,
        fee: price,
        cappedAtDailyCap: false,
      }));
      return { lines, total: price * players.length };
    }
    return { lines: [], total: price };
  }

  // HOURLY
  const hourlyRate = pricingType.hourlyRate ?? 0;

  if (pricingType.perPerson) {
    const lines: TableFeeLine[] = players.map((p) => {
      const ms = computePlayerBillableMs(p, now);
      const minutes = ms / 60_000;
      const chargedHours = minutesToChargedHours(
        minutes,
        pricingType.gracePeriodMinutes,
      );
      const { fee, capped } = applyDailyCap(
        chargedHours * hourlyRate,
        pricingType.dailyCap,
      );
      return {
        playerId: p.id,
        billableMinutes: minutes,
        chargedHours,
        fee,
        cappedAtDailyCap: capped,
      };
    });
    return { lines, total: lines.reduce((sum, l) => sum + l.fee, 0) };
  }

  // Flat table-level hourly pricing (not per person): bill once, using the
  // longest-running player's elapsed time as the table's elapsed time.
  if (players.length === 0) return { lines: [], total: 0 };
  const earliestStart = new Date(
    Math.min(...players.map((p) => p.startTime.getTime())),
  );
  const ms = Math.max(
    ...players.map((p) =>
      computePlayerBillableMs({ ...p, startTime: earliestStart }, now),
    ),
  );
  const minutes = ms / 60_000;
  const chargedHours = minutesToChargedHours(
    minutes,
    pricingType.gracePeriodMinutes,
  );
  const { fee, capped } = applyDailyCap(
    chargedHours * hourlyRate,
    pricingType.dailyCap,
  );
  return {
    lines: [
      {
        playerId: "table",
        billableMinutes: minutes,
        chargedHours,
        fee,
        cappedAtDailyCap: capped,
      },
    ],
    total: fee,
  };
}
