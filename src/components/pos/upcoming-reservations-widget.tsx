"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

/** Compact strip on the Cashier dashboard (§3) — the full manager lives at /cashier/reservations. */
export function UpcomingReservationsWidget() {
  const { data: upcoming } = trpc.reservations.listUpcoming.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const next = upcoming?.slice(0, 4) ?? [];
  if (next.length === 0) return null;

  return (
    <div className="flex items-center gap-3 overflow-x-auto rounded-xl border border-border bg-surface px-3 py-2">
      <span className="shrink-0 text-xs font-medium text-foreground-muted">
        Upcoming:
      </span>
      {next.map((r) => (
        <span
          key={r.id}
          className="shrink-0 rounded-full bg-background px-3 py-1 text-xs text-foreground"
        >
          {new Date(r.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{" "}
          · {r.customerName} ({r.partySize})
        </span>
      ))}
      <Link href="/cashier/reservations" className="shrink-0 text-xs text-teal-600 underline">
        View all
      </Link>
    </div>
  );
}
