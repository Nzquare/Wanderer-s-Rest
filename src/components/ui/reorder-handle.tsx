/**
 * Pairs with useDragReorder: the grip drives desktop mouse drag, the two
 * arrow buttons are the touch-friendly fallback since HTML5 drag-and-drop
 * doesn't fire on phones at all — without them, reordering silently does
 * nothing on any touch device (§mobile audit).
 */
export function ReorderHandle({
  handleProps,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  className,
}: {
  handleProps: React.HTMLAttributes<HTMLSpanElement>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-1 ${className ?? ""}`}>
      <span
        {...handleProps}
        title="Drag to reorder"
        className="cursor-grab select-none text-foreground-muted active:cursor-grabbing"
      >
        ⠿
      </span>
      <span className="flex flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          aria-label="Move up"
          className="leading-none text-foreground-muted hover:text-foreground disabled:opacity-30"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          aria-label="Move down"
          className="leading-none text-foreground-muted hover:text-foreground disabled:opacity-30"
        >
          ▼
        </button>
      </span>
    </span>
  );
}
