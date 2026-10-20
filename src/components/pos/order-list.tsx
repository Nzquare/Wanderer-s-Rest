"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc/client";
import { printKitchenTicket } from "@/lib/thermal-print";
import {
  KitchenTicket,
  splitTicketByStation,
  type KitchenTicketEntry,
  type KitchenTicketOrder,
} from "./kitchen-ticket";

interface OrderItemModifier {
  id: string;
  nameSnapshotEn: string;
}
interface OrderItemComboSelection {
  id: string;
  slotNameSnapshotEn: string;
  nameSnapshotEn: string;
}
interface OrderItem {
  id: string;
  nameSnapshotEn: string;
  quantity: number;
  unitPriceSnapshot: unknown;
  notes?: string | null;
  modifiers: OrderItemModifier[];
  comboSelections?: OrderItemComboSelection[];
  station: string;
}
interface Order {
  id: string;
  source: "CASHIER" | "STAFF" | "CUSTOMER_QR";
  createdAt: string | Date;
  notes?: string | null;
  staffName?: string | null;
  items: OrderItem[];
}

const SOURCE_LABEL: Record<Order["source"], string> = {
  CASHIER: "Cashier",
  STAFF: "Staff",
  CUSTOMER_QR: "Customer (QR)",
};

/** Same order shape the kitchen ticket needs, built once per order here
 * rather than re-fetched — every field it needs is already on hand. */
function toTicketOrder(order: Order, tableCode: string, cancelled = false): KitchenTicketOrder {
  return {
    id: order.id,
    tableCode,
    source: order.source,
    staffName: order.staffName ?? null,
    createdAt: order.createdAt,
    notes: order.notes ?? null,
    cancelled,
    items: order.items.map((item) => ({
      id: item.id,
      nameEn: item.nameSnapshotEn,
      quantity: item.quantity,
      notes: item.notes ?? null,
      modifierNames: item.modifiers.map((m) => m.nameSnapshotEn),
      comboSelections: (item.comboSelections ?? []).map((cs) => ({
        slotNameEn: cs.slotNameSnapshotEn,
        nameEn: cs.nameSnapshotEn,
      })),
      station: item.station,
    })),
  };
}

/**
 * A session's order history on the table page — every order placed this
 * session (Cashier/Staff/Customer QR alike), each with its own "🖨️
 * Reprint" button (§Kitchen ticket reprint) so a lost/jammed/needed-again
 * ticket doesn't require redoing the order. Not gated by acknowledged
 * status or how it was originally printed — any order here can be
 * reprinted any time, independent of the alert banner's one-shot flow.
 */
export function OrderList({
  orders,
  tableCode,
  tableId,
}: {
  orders: Order[];
  tableCode: string;
  tableId: string;
}) {
  const { data: checkoutSettings } = trpc.settings.getCheckout.useQuery();
  const [printEntries, setPrintEntries] = useState<KitchenTicketEntry[] | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  // Only one order's Cancel can be mid-confirm at a time — good enough
  // for a list someone's looking straight at, same as every other
  // confirm/cancel control in the app.
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const cancelOrder = trpc.orders.cancel.useMutation({
    onSuccess: (_data, variables) => {
      setConfirmingCancelId(null);
      const cancelled = orders.find((o) => o.id === variables.orderId);
      if (cancelled) {
        // Prints a "CANCELLED" notice ticket for the kitchen (§Cancel
        // order) from the same order data already on hand here — the
        // cancel mutation itself only flips the status, no need to
        // round-trip the order's items back out of it.
        const entries = splitTicketByStation(toTicketOrder(cancelled, tableCode, true));
        printKitchenTicket(
          entries,
          checkoutSettings,
          setPrintEntries,
          () => setPrintEntries(null),
          setBridgeError,
        );
      }
      return Promise.all([
        utils.sessions.getTableDetail.invalidate({ tableId }),
        utils.sessions.listTables.invalidate(),
      ]);
    },
  });

  if (orders.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No food/drink orders yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {bridgeError && (
        <p className="text-sm text-status-danger">
          Kitchen ticket print failed: {bridgeError}
        </p>
      )}
      {cancelOrder.error && (
        <p className="text-sm text-status-danger">{cancelOrder.error.message}</p>
      )}
      {orders.map((order) => (
        <Card key={order.id} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              {SOURCE_LABEL[order.source]}
              {order.staffName ? ` · ${order.staffName}` : ""}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground-muted">
                {new Date(order.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <button
                onClick={() => {
                  // Splits by menu category (§Separate kitchen ticket by
                  // category), but still just one printOnce job/
                  // window.print() call for the reprint — KitchenTicket
                  // renders every split entry as its own page inside
                  // that one print area. Goes through the network print
                  // bridge instead when one's configured (§Network
                  // thermal printer / print bridge).
                  const entries = splitTicketByStation(toTicketOrder(order, tableCode));
                  printKitchenTicket(
                    entries,
                    checkoutSettings,
                    setPrintEntries,
                    () => setPrintEntries(null),
                    setBridgeError,
                  );
                }}
                title="Reprint kitchen ticket"
                className="rounded-lg border border-teal-600 px-2 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-300"
              >
                🖨️ Reprint
              </button>
              {confirmingCancelId === order.id ? (
                <span className="flex items-center gap-1.5 text-xs">
                  <button
                    disabled={cancelOrder.isPending}
                    onClick={() => cancelOrder.mutate({ orderId: order.id })}
                    className="font-medium text-status-danger underline"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmingCancelId(null)}
                    className="text-foreground-muted underline"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmingCancelId(order.id)}
                  title="Cancel this order — prints a CANCELLED notice for the kitchen"
                  className="rounded-lg border border-status-danger px-2 py-0.5 text-xs font-medium text-status-danger"
                >
                  Cancel order
                </button>
              )}
            </div>
          </div>
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-foreground">
                {item.quantity} × {item.nameSnapshotEn}
                {(item.modifiers.length > 0 || (item.comboSelections?.length ?? 0) > 0) && (
                  <span className="text-foreground-muted">
                    {" "}
                    (
                    {[
                      ...item.modifiers.map((m) => m.nameSnapshotEn),
                      ...(item.comboSelections ?? []).map(
                        (cs) => `${cs.slotNameSnapshotEn}: ${cs.nameSnapshotEn}`,
                      ),
                    ].join(", ")}
                    )
                  </span>
                )}
              </span>
              <span className="tabular-nums text-foreground-muted">
                ฿{Number(item.unitPriceSnapshot) * item.quantity}
              </span>
            </div>
          ))}
        </Card>
      ))}
      {printEntries && (
        <KitchenTicket
          entries={printEntries}
          printerWidthMm={checkoutSettings?.printerWidthMm ?? 80}
          printAreaId="kitchen-print-area-list"
        />
      )}
    </div>
  );
}
