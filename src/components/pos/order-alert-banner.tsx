"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { playChime } from "@/lib/chime";
import { cn } from "@/lib/cn";

const SOURCE_LABEL: Record<string, string> = {
  STAFF: "Staff order",
  CUSTOMER_QR: "Customer order",
};

/**
 * Lives in the Cashier shell so it's present on every screen (§17). Polls
 * for unacknowledged Staff/Customer-QR orders; new ones ring once and
 * surface as a dismissible banner until acknowledged (from here or by
 * opening the table).
 */
export function OrderAlertBanner() {
  const utils = trpc.useUtils();
  const { data: notificationSettings } = trpc.settings.getNotifications.useQuery();
  const { data: pending } = trpc.orders.listUnacknowledged.useQuery(undefined, {
    refetchInterval: 4_000,
  });
  const acknowledge = trpc.orders.acknowledge.useMutation({
    onSuccess: () => utils.orders.listUnacknowledged.invalidate(),
  });

  const seenIds = useRef<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!pending || !notificationSettings) return;
    const newOnes = pending.filter((o) => !seenIds.current.has(o.id));
    pending.forEach((o) => seenIds.current.add(o.id));

    const shouldRing = newOnes.some(
      (o) =>
        (o.source === "CUSTOMER_QR" && notificationSettings.notifyOnCustomerOrder) ||
        (o.source === "STAFF" && notificationSettings.notifyOnStaffOrder),
    );
    if (shouldRing && notificationSettings.cashierSoundEnabled) {
      playChime(notificationSettings.volume);
    }
    if (newOnes.length > 0) setCollapsed(false);
  }, [pending, notificationSettings]);

  if (!pending || pending.length === 0) return null;

  return (
    <div className="border-b border-teal-500/30 bg-teal-500/10">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm font-medium text-teal-700 dark:text-teal-300"
      >
        <span>
          {pending.length} new order{pending.length > 1 ? "s" : ""} waiting
        </span>
        <span>{collapsed ? "Show ▾" : "Hide ▴"}</span>
      </button>
      {!collapsed && (
        <div className="space-y-1 px-4 pb-3">
          {pending.map((order) => (
            <div
              key={order.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm shadow-sm",
              )}
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {SOURCE_LABEL[order.source] ?? order.source} — T
                  {order.tableCode.replace(/^T/i, "")}
                  {order.staffName ? ` · ${order.staffName}` : ""}
                </p>
                <p className="truncate text-xs text-foreground-muted">
                  {order.itemSummary}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/cashier/tables/${order.tableId}`}
                  onClick={() => acknowledge.mutate({ orderId: order.id })}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white"
                >
                  View
                </Link>
                <button
                  onClick={() => acknowledge.mutate({ orderId: order.id })}
                  className="text-xs text-foreground-muted underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
