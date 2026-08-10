"use client";

import { useState } from "react";
import { Modal } from "./modal";

/** Curated set for achievement icons — no need for a full emoji-picker
 * dependency just to cover "trophy/fantasy/food/game" territory. */
const EMOJI_GROUPS: { label: string; emoji: string[] }[] = [
  {
    label: "Achievements",
    emoji: ["🏆", "🥇", "🥈", "🥉", "🎖️", "🏅", "⭐", "🌟", "✨", "💫", "🎯", "🎗️"],
  },
  {
    label: "Fantasy & Adventure",
    emoji: ["⚔️", "🛡️", "🗡️", "🏹", "🔮", "🧙", "🐉", "🐲", "👑", "💎", "🗝️", "📜", "🧝", "🧙‍♀️", "🏰", "⚡"],
  },
  {
    label: "Games",
    emoji: ["🎲", "🎮", "♟️", "🃏", "🀄", "🎴", "🧩", "🎳"],
  },
  {
    label: "Food & Drink",
    emoji: ["🍺", "🍻", "🍷", "🍹", "🍵", "☕", "🍕", "🍗", "🍰", "🍪", "🧁"],
  },
  {
    label: "Social & Hearts",
    emoji: ["❤️", "💛", "💚", "💙", "💜", "🧡", "🤝", "👥", "🎉", "🎊", "🥳"],
  },
  {
    label: "Misc",
    emoji: ["🔥", "💯", "🚀", "🌈", "🍀", "🦄", "👻", "💀", "🕐", "📅", "🎂", "🔔"],
  },
];

export function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Choose icon"
        className="flex h-10 w-full items-center justify-center rounded-lg border border-border bg-background text-lg hover:border-teal-500"
      >
        {value || "🏆"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Choose an icon</h3>
            <button onClick={() => setOpen(false)} className="text-sm text-foreground-muted hover:text-foreground">
              ✕ Close
            </button>
          </div>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {EMOJI_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1 text-xs font-medium text-foreground-muted">{group.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.emoji.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        onChange(e);
                        setOpen(false);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-xl hover:border-teal-500 hover:bg-teal-500/10"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-2 border-t border-border pt-3">
            <div className="flex-1">
              <label className="text-xs text-foreground-muted">Or paste any emoji</label>
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="🐧"
                className="h-10 w-full rounded-lg border border-border bg-background px-2 text-center text-lg"
              />
            </div>
            <button
              type="button"
              disabled={!custom.trim()}
              onClick={() => {
                onChange(custom.trim());
                setCustom("");
                setOpen(false);
              }}
              className="h-10 rounded-lg border border-border px-3 text-sm text-foreground hover:border-teal-500 disabled:opacity-40"
            >
              Use
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
