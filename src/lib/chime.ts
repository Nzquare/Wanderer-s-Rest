"use client";

// Synthesizes a short two-note chime via Web Audio instead of shipping an
// audio asset — works everywhere, respects the volume setting, and needs
// no file to host (§17 "one short sound, not a looping alarm").
let sharedContext: AudioContext | null = null;

function getContextCtor() {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  );
}

function ensureContext(): AudioContext | null {
  const Ctx = getContextCtor();
  if (!Ctx) return null;
  sharedContext ??= new Ctx();
  return sharedContext;
}

// Browsers only let an AudioContext actually make sound after a user
// gesture unlocks it — one created (or left suspended) from a background
// poll's useEffect, with no click involved, schedules its oscillators
// without ever throwing, but nothing audible comes out (§order-notification
// silence). Unlock on the very first tap/click/keypress anywhere on the
// page, once, so the shared context is already running by the time a real
// order comes in and playChime is called from that same poll.
if (typeof window !== "undefined") {
  const unlock = () => {
    const ctx = ensureContext();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

export function playChime(volume: number = 0.8) {
  try {
    const ctx = ensureContext();
    if (!ctx) return;
    // Best-effort re-unlock — covers the rare case a gesture hasn't
    // happened yet, or the context got suspended again (e.g. tab was
    // backgrounded). If this resolves too late for *this* chime, the
    // context is at least running for the next one.
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;

    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume * 0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
  } catch {
    // Audio isn't critical — never let a chime failure break the UI.
  }
}
