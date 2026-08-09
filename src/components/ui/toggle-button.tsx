import { cn } from "@/lib/cn";

/**
 * A toggle that unmistakably reads as clickable — solid border, a filled
 * on/off dot, and a hover state — instead of a flat status pill that looks
 * like a label. Used everywhere a boolean gets flipped from the UI
 * (active/inactive, sold out, QR on/off, etc.).
 */
export function ToggleButton({
  on,
  onLabel,
  offLabel,
  onClick,
  disabled,
  tone = "default",
}: {
  on: boolean;
  onLabel: string;
  offLabel?: string;
  onClick: () => void;
  disabled?: boolean;
  /** "danger" flips the ON color to red instead of teal/green — for things like "Sold out". */
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
        on
          ? tone === "danger"
            ? "border-status-danger bg-status-danger/15 text-status-danger hover:bg-status-danger/25"
            : "border-teal-500 bg-teal-500/15 text-teal-700 hover:bg-teal-500/25 dark:text-teal-300"
          : "border-border bg-surface text-foreground-muted hover:border-foreground-muted",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          on ? (tone === "danger" ? "bg-status-danger" : "bg-teal-500") : "bg-foreground-muted/50",
        )}
      />
      {on ? onLabel : (offLabel ?? onLabel)}
    </button>
  );
}
