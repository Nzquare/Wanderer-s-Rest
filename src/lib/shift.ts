/**
 * A shift left open this long almost certainly wasn't closed on purpose —
 * flagged so it doesn't just sit forgotten (§Automatic shift close). Not
 * an exact science: a genuinely long single shift is possible, so this is
 * a nudge to check, not a hard rule. Shared between the Shift page's own
 * warning and the Cashier shell's passive banner so they agree on the
 * same threshold.
 */
export const SHIFT_STALE_HOURS = 18;

export function isShiftStale(openedAt: Date | string, now: Date = new Date()): boolean {
  const openedMs = new Date(openedAt).getTime();
  return now.getTime() - openedMs > SHIFT_STALE_HOURS * 60 * 60 * 1000;
}
