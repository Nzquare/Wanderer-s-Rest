import { cn } from "@/lib/cn";
import type { TableStatus } from "@/generated/prisma/enums";

const STATUS_STYLES: Record<TableStatus, string> = {
  AVAILABLE: "bg-status-success/15 text-status-success",
  RESERVED: "bg-status-warning/15 text-status-warning",
  PLAYING: "bg-status-active/15 text-status-active",
  PAUSED: "bg-status-warning/15 text-status-warning",
  READY_TO_CHECKOUT: "bg-teal-500/20 text-teal-600",
  CHECKOUT_IN_PROGRESS: "bg-teal-500/20 text-teal-600",
  CLEANING: "bg-status-neutral/15 text-status-neutral",
  CLOSED: "bg-status-neutral/15 text-status-neutral",
  UNAVAILABLE: "bg-status-danger/15 text-status-danger",
};

const STATUS_LABELS: Record<TableStatus, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  PLAYING: "Playing",
  PAUSED: "Paused",
  READY_TO_CHECKOUT: "Ready to Checkout",
  CHECKOUT_IN_PROGRESS: "Checkout in Progress",
  CLEANING: "Cleaning",
  CLOSED: "Closed",
  UNAVAILABLE: "Unavailable",
};

export function TableStatusBadge({ status }: { status: TableStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
