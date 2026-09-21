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
    // Which ticket this item prints on (§Separate kitchen ticket by
    // category) — the menu item's own category name, automatically, no
    // setup step needed; "Other" for anything unresolved (e.g. a
    // hard-deleted menu item, same fallback the Sales by Category report
    // and checkout bill grouping already use). Only read by
    // splitTicketByStation below; the ticket itself doesn't render it
    // per item.
    station: string;
  }[];
}

export interface KitchenTicketEntry<T extends KitchenTicketOrder = KitchenTicketOrder> {
  station: string;
  ticket: T;
}

/**
 * Splits one order into one ticket per distinct menu category its items
 * belong to (§Separate kitchen ticket by category) — e.g. Food items on
 * their own ticket, Drinks on another, automatically, with no per-
 * category setup — so each station only ever sees its own items instead
 * of one mixed list. Feed the result straight to <KitchenTicket
 * entries={...} /> — one printOnce call still covers the whole order,
 * this only decides how many physical pages it becomes.
 *
 * Order/table/notes metadata is repeated on each resulting ticket; only
 * `items` differs. Categories appear in first-seen order among the
 * order's items, not alphabetically, so the most relevant one for that
 * order tends to print first.
 *
 * Generic over the caller's own order shape (which may carry extra
 * fields beyond KitchenTicketOrder, e.g. orders.listUnacknowledged's
 * `tableId`/`itemSummary`) so those pass through untouched — only
 * `items` is ever replaced.
 */
export function splitTicketByStation<T extends KitchenTicketOrder>(
  order: T,
): KitchenTicketEntry<T>[] {
  const stations: string[] = [];
  const itemsByStation = new Map<string, KitchenTicketOrder["items"]>();
  for (const item of order.items) {
    if (!itemsByStation.has(item.station)) {
      stations.push(item.station);
      itemsByStation.set(item.station, []);
    }
    itemsByStation.get(item.station)!.push(item);
  }
  return stations.map((station) => ({
    station,
    ticket: { ...order, items: itemsByStation.get(station)! },
  }));
}

/** One ticket's own content — table header, items, notes. Pure display. */
function TicketContent({ order, station }: { order: KitchenTicketOrder; station: string }) {
  return (
    <div className="mx-auto max-w-xs space-y-3 p-4 font-mono">
      {/* Blank strip above the header — enough clear paper to clip or
          magnet the ticket to a board without covering the table
          number or any item line. */}
      <div style={{ height: "18mm" }} aria-hidden />
      <div className="space-y-0.5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em]">{station} Order</p>
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
  );
}

/**
 * The printed kitchen ticket(s) themselves (§Kitchen order printing) —
 * deliberately bigger/plainer than the invoice/receipt print areas:
 * kitchen staff read this fast, from a distance, on a food-splattered
 * counter, not line by line like a bill. Big bold item lines, table code
 * the largest thing on the page, modifiers/combo picks/notes indented so
 * they can't be missed but don't compete with the item name for attention.
 *
 * Takes `entries` (from splitTicketByStation) rather than a single order
 * — every entry renders inside this ONE print area, separated by a CSS
 * page break, so an order spanning multiple categories still comes out
 * as separate physical tickets from a SINGLE window.print() call/
 * printOnce job (§confirm payment, nothing prints and its sequels —
 * queuing one printOnce job per category here instead landed as some
 * tickets printing blank: extra window.print() calls fired close
 * together are exactly the overlapping-print-call situation print-
 * once.ts's own doc comment already warns about). One print job, one
 * user interaction, however many pages it turns into.
 *
 * Lives in its own component so the alert banner's manual "Print" button,
 * its auto-print-on-arrival path, and the Cashier order panel's own
 * "order placed" print (§Kitchen order printing for cashier-entered
 * orders) all render the exact same ticket(s).
 *
 * `printAreaId` defaults to the one shared id, but the alert banner and
 * the order panel can both be mounted on the same page at once (the
 * Cashier table page — banner in the shell, panel in the page content),
 * so a caller that might render alongside another KitchenTicket needs its
 * own id to avoid two elements sharing one — see order-panel.tsx.
 */
export function KitchenTicket({
  entries,
  printerWidthMm,
  printAreaId = "kitchen-print-area",
}: {
  entries: KitchenTicketEntry[];
  printerWidthMm: number;
  printAreaId?: string;
}) {
  return (
    <div
      id={printAreaId}
      style={{ "--receipt-print-width": `${printerWidthMm}mm` } as CSSProperties}
      className="print-area hidden print:block"
    >
      {entries.map((entry, i) => (
        <div
          key={entry.station}
          style={i < entries.length - 1 ? { pageBreakAfter: "always" } : undefined}
        >
          <TicketContent order={entry.ticket} station={entry.station} />
        </div>
      ))}
    </div>
  );
}
