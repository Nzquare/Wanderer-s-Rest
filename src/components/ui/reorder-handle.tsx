import type { ReorderHandleProps } from "@/lib/use-drag-reorder";

/**
 * Pairs with useDragReorder (Pointer Events under the hood) — drags
 * correctly with a mouse, a finger, or a pen, all through the same
 * handler, so there's no separate touch fallback needed.
 */
export function ReorderHandle({
  handleProps,
  className,
}: {
  handleProps: ReorderHandleProps;
  className?: string;
}) {
  return (
    <span
      {...handleProps}
      title="Drag to reorder"
      className={`cursor-grab select-none px-1 text-foreground-muted active:cursor-grabbing ${className ?? ""}`}
    >
      ⠿
    </span>
  );
}
