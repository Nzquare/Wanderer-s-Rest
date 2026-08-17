import type { CSSProperties } from "react";

const SOURCE_LABEL: Record<string, string> = {
  STAFF: "Staff order",
  CUSTOMER_QR: "Customer order",
  CASHIER: "Cashier order",
};

export interface KitchenTicketOrder {
  id: string;
  tableCode: string;
  source: string;
  staffName: string | null;
  createdAt: string | Date;
  notes: string | null;
  items: {
    id: string;
    nameEn: string;
    quantity: number;
    notes: string | null;
    modifierNames: string[];
    comboSelections: { slotNameEn: string; nameEn: string }[];
  }[];
}

/**
 * The printed kitchen ticket itself (§Kitchen order printing) — deliberately
 * bigger/plainer than the invoice/receipt print areas: kitchen staff read
 * this fast, from a distance, on a food-splattered counter, not line by
 * line like a bill. Big bold item lines, table code the largest thing on
 * the page, modifiers/combo picks/notes indented so they can't be missed
 * but don't compete with the item name for attention.
 *
 * Lives in its own component so the alert banner's manual "Print" button,
 * its auto-print-on-arrival path, and the Cashier order panel's own
 * "order placed" print (§Kitchen order printing for cashier-entered
 * orders) all render the exact same ticket.
 *
 * `printAreaId` defaults to the one shared id, but the alert banner and
 * the order panel can both be mounted on the same page at once (the
 * Cashier table page — banner in the shell, panel in the page content),
 * so a caller that might render alongside another KitchenTicket needs its
 * own id to avoid two elements sharing one — see order-panel.tsx.
 */
export function KitchenTicket({
  order,
  printerWidthMm,
  printAreaId = "kitchen-print-area",
}: {
  order: KitchenTicketOrder;
  printerWidthMm: number;
  printAreaId?: string;
}) {
  return (
    <div
      id={printAreaId}
      style={{ "--receipt-print-width": `${printerWidthMm}mm` } as CSSProperties}
      className="hidden print:block"
    >
      <div className="mx-auto max-w-xs space-y-3 p-4 font-mono">
        <div className="space-y-0.5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]">Kitchen Order</p>
          <p className="text-3xl font-bold">Table {order.tableCode}</p>
          <p className="text-xs">
            {SOURCE_LABEL[order.source] ?? order.source}
            {order.staffName ? ` · ${order.staffName}` : ""}
          </p>
          <p className="text-xs">{new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <div className="space-y-2 border-t border-dashed border-black pt-2">
          {order.items.map((item) => (
            <div key={item.id} className="space-y-0.5">
              <p className="text-lg font-bold leading-tight">
                {item.quantity}× {item.nameEn}
              </p>
              {item.modifierNames.map((name, i) => (
                <p key={i} className="pl-4 text-sm">
                  + {name}
                </p>
              ))}
              {item.comboSelections.map((cs, i) => (
                <p key={i} className="pl-4 text-sm">
                  {cs.slotNameEn}: {cs.nameEn}
                </p>
              ))}
              {item.notes && <p className="pl-4 text-sm italic">Note: {item.notes}</p>}
            </div>
          ))}
        </div>
        {order.notes && (
          <div className="border-t border-dashed border-black pt-2 text-sm italic">
            Order note: {order.notes}
          </div>
        )}
      </div>
    </div>
  );
}
