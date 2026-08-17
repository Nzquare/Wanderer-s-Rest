"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc/client";
import { printOnce } from "@/lib/print-once";
import { KitchenTicket, type KitchenTicketOrder } from "./kitchen-ticket";

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
function toTicketOrder(order: Order, tableCode: string): KitchenTicketOrder {
  return {
    id: order.id,
    tableCode,
    source: order.source,
    staffName: order.staffName ?? null,
    createdAt: order.createdAt,
    notes: order.notes ?? null,
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
export function OrderList({ orders, tableCode }: { orders: Order[]; tableCode: string }) {
  const { data: checkoutSettings } = trpc.settings.getCheckout.useQuery();
  const [printOrder, setPrintOrder] = useState<KitchenTicketOrder | null>(null);

  if (orders.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No food/drink orders yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
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
                onClick={() =>
                  printOnce(
                    () => setPrintOrder(toTicketOrder(order, tableCode)),
                    () => setPrintOrder(null),
                  )
                }
                title="Reprint kitchen ticket"
                className="rounded-lg border border-teal-600 px-2 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-300"
              >
                🖨️ Reprint
              </button>
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
      {printOrder && (
        <KitchenTicket
          order={printOrder}
          printerWidthMm={checkoutSettings?.printerWidthMm ?? 80}
          printAreaId="kitchen-print-area-list"
        />
      )}
    </div>
  );
}
