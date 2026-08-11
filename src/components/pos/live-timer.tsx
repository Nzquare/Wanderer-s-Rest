"use client";

import { useEffect, useState } from "react";

export interface TimerInputs {
  startTime: string | Date;
  pausedAt: string | Date | null;
  accumulatedPausedMs: number;
  endTime: string | Date | null;
  status: "ACTIVE" | "PAUSED" | "STOPPED";
}

export function computeElapsedMs(t: TimerInputs, now: number): number {
  const start = new Date(t.startTime).getTime();
  const end = t.endTime ? new Date(t.endTime).getTime() : now;
  const ongoingPause =
    t.status === "PAUSED" && t.pausedAt
      ? Math.max(0, now - new Date(t.pausedAt).getTime())
      : 0;
  return Math.max(0, end - start - t.accumulatedPausedMs - ongoingPause);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Compact "1h 30m" / "45m" form — for a static bill line, not a ticking clock. */
export function formatMinutesShort(totalMinutes: number): string {
  const whole = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Ticks locally every second — no polling needed just to move a clock. */
export function LiveTimer({ timer }: { timer: TimerInputs }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timer.status !== "ACTIVE") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer.status]);

  const elapsed = computeElapsedMs(timer, now);
  return <span className="tabular-nums">{formatDuration(elapsed)}</span>;
}
