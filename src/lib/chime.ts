"use client";

// Synthesizes a short two-note chime via Web Audio instead of shipping an
// audio asset — works everywhere, respects the volume setting, and needs
// no file to host (§17 "one short sound, not a looping alarm").
let sharedContext: AudioContext | null = null;

export function playChime(volume: number = 0.8) {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    sharedContext ??= new Ctx();
    const ctx = sharedContext;
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
