"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { isShiftStale, SHIFT_STALE_HOURS } from "@/lib/shift";

/**
 * Lives in the Cashier shell (§Automatic shift close) so a shift left
 * open for way too long is visible from anywhere, not just to whoever
 * happens to check the Shift page — the whole point is catching one that
 * got forgotten, so it can't rely on someone remembering to look. No
 * dismiss/acknowledge action here (unlike OrderAlertBanner's orders) —
 * it just stops showing once the shift's actually closed, which is the
 * only thing that should make it go away.
 */
export function StaleShiftBanner() {
  const { data: shift } = trpc.shifts.getCurrent.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  if (!shift || !isShiftStale(shift.openedAt)) return null;

  return (
    <div className="border-b border-status-warning/30 bg-status-warning/10 px-4 py-2 text-sm text-status-warning">
      ⚠ Shift opened by {shift.openedByName} has been open more than {SHIFT_STALE_HOURS}{" "}
      hours.{" "}
      <Link href="/cashier/shift" className="font-medium underline">
        Review it
      </Link>
    </div>
  );
}
