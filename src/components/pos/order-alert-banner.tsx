"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/routers/_app";
import { playChime } from "@/lib/chime";
import { printOnce } from "@/lib/print-once";
import { cn } from "@/lib/cn";
import { KitchenTicket } from "./kitchen-ticket";

const SOURCE_LABEL: Record<string, string> = {
  STAFF: "Staff order",
  CUSTOMER_QR: "Customer order",
};

type PendingOrder = inferRouterOutputs<AppRouter>["orders"]["listUnacknowledged"][number];

/**
 * Lives in the Cashier shell so it's present on every screen (§17). Polls
 * for unacknowledged Staff/Customer-QR orders; new ones ring once and
 * surface as a dismissible banner until acknowledged (from here or by
 * opening the table).
 */
export function OrderAlertBanner() {
  const utils = trpc.useUtils();
  const { data: notificationSettings } = trpc.settings.getNotifications.useQuery();
  const { data: checkoutSettings } = trpc.settings.getCheckout.useQuery();
  const { data: pending } = trpc.orders.listUnacknowledged.useQuery(undefined, {
    refetchInterval: 4_000,
  });
  const acknowledge = trpc.orders.acknowledge.useMutation({
    onSuccess: () => utils.orders.listUnacknowledged.invalidate(),
  });

  const seenIds = useRef<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  // The order currently loaded into the hidden #kitchen-print-area — set
  // right before window.print() and cleared again once the print dialog
  // closes (see printOnce), so it doesn't stay `print:block` and bleed
  // into some other print job on a later Cashier page (§printer overlap
  // bug — this banner lives in the shell, present on every screen).
  const [printOrder, setPrintOrder] = useState<PendingOrder | null>(null);

  function printTicket(order: PendingOrder) {
    printOnce(
      () => setPrintOrder(order),
      () => setPrintOrder(null),
    );
  }

  useEffect(() => {
    if (!pending || !notificationSettings) return;
    const newOnes = pending.filter((o) => !seenIds.current.has(o.id));
    pending.forEach((o) => seenIds.current.add(o.id));

    const notifiable = (o: PendingOrder) =>
      (o.source === "CUSTOMER_QR" && notificationSettings.notifyOnCustomerOrder) ||
      (o.source === "STAFF" && notificationSettings.notifyOnStaffOrder);

    const shouldRing = newOnes.some(notifiable);
    if (shouldRing && notificationSettings.cashierSoundEnabled) {
      playChime(notificationSettings.volume);
    }
    if (newOnes.length > 0) setCollapsed(false);

    // Auto-print one kitchen ticket per poll tick (§Kitchen order
    // printing) — if several orders land in the same tick, only the
    // first opens a print dialog automatically; the rest stay one tap
    // away via the manual Print button on each row below, rather than
    // stacking multiple print dialogs on top of each other.
    if (notificationSettings.autoPrintKitchenTicket) {
      const toAutoPrint = newOnes.find(notifiable);
      if (toAutoPrint) printTicket(toAutoPrint);
    }
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
                <button
                  onClick={() => printTicket(order)}
                  title="Print kitchen ticket"
                  className="rounded-lg border border-teal-600 px-2 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-300"
                >
                  🖨️ Print
                </button>
                {/* Just navigates — viewing the table used to also silently
                    acknowledge (and so remove) the notification, so a
                    glance at the table lost it before staff had actually
                    dealt with the order (§notification shouldn't
                    disappear on view). Only Confirm below does that now. */}
                <Link
                  href={`/cashier/tables/${order.tableId}`}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white"
                >
                  View
                </Link>
                <button
                  onClick={() => acknowledge.mutate({ orderId: order.id })}
                  className="rounded-lg border border-border px-2 py-1.5 text-xs font-medium text-foreground-muted"
                >
                  Confirm
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {printOrder && (
        <KitchenTicket order={printOrder} printerWidthMm={checkoutSettings?.printerWidthMm ?? 80} />
      )}
    </div>
  );
}
