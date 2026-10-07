import type { KitchenTicketEntry, KitchenTicketOrder } from "@/components/pos/kitchen-ticket";

/**
 * Raw ESC/POS formatting for network thermal printers that don't speak
 * AirPrint — e.g. a WiFi printer that only listens for raw bytes on a TCP
 * port (§Network thermal printer / print bridge). Browsers (iOS Safari
 * included) can only ever print through the OS print dialog, which
 * requires AirPrint; this is the alternate path for printers that don't
 * have it, routed through a small local bridge program (see
 * print-bridge/) that relays these bytes over a raw TCP socket.
 *
 * Plain-text analog of the HTML receipt/ticket, built from the exact same
 * structured data (KitchenTicketEntry/ReceiptSnapshot) — not a visual
 * clone of the print-area markup. Codepage support varies a lot between
 * cheap thermal printers, so this sticks to UTF-8 text; non-Latin
 * characters (e.g. Thai) may not render correctly on every model.
 */

const ESC = 0x1b;
const GS = 0x1d;

class EscposBuilder {
  private chunks: Uint8Array[] = [];

  private push(...bytes: number[]) {
    this.chunks.push(new Uint8Array(bytes));
  }

  init(): this {
    this.push(ESC, 0x40); // ESC @ — initialize
    return this;
  }

  align(mode: "left" | "center" | "right"): this {
    const n = mode === "center" ? 1 : mode === "right" ? 2 : 0;
    this.push(ESC, 0x61, n); // ESC a n
    return this;
  }

  bold(on: boolean): this {
    this.push(ESC, 0x45, on ? 1 : 0); // ESC E n
    return this;
  }

  big(on: boolean): this {
    this.push(GS, 0x21, on ? 0x11 : 0x00); // GS ! n — double width+height
    return this;
  }

  text(str: string): this {
    this.chunks.push(new TextEncoder().encode(str));
    return this;
  }

  line(str = ""): this {
    this.text(str);
    this.push(0x0a);
    return this;
  }

  hr(width: number, char = "-"): this {
    return this.line(char.repeat(width));
  }

  feed(lines = 1): this {
    this.push(ESC, 0x64, lines); // ESC d n — print and feed n lines
    return this;
  }

  cut(): this {
    this.push(GS, 0x56, 0x42, 0x00); // GS V 66 0 — feed and full cut
    return this;
  }

  /** The standard Epson "2D barcode" QR command block (GS ( k ...),
   * cloned by virtually every ESC/POS thermal printer — the printer
   * itself renders the QR code from the raw URL text, so there's no
   * image to rasterize or embed. moduleSize is the dot size in printer
   * units (1-16; 4-8 is a typical readable range on receipt paper). */
  qrCode(data: string, moduleSize = 6, errorCorrection: "L" | "M" | "Q" | "H" = "M"): this {
    const ecLevel = { L: 48, M: 49, Q: 50, H: 51 }[errorCorrection];
    const dataBytes = new TextEncoder().encode(data);

    this.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // select model 2
    this.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize); // module size
    this.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, ecLevel); // error correction level

    // Store the data to print — a variable-length command, so its pL/pH
    // length prefix (low byte, high byte) covers everything after pH:
    // cn + fn + m + the data itself.
    const storeLen = dataBytes.length + 3;
    this.push(GS, 0x28, 0x6b, storeLen & 0xff, (storeLen >> 8) & 0xff, 0x31, 0x50, 0x30);
    this.chunks.push(dataBytes);

    this.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // print the stored QR code
    return this;
  }

  build(): Uint8Array {
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

/** 58mm/80mm thermal paper fits roughly 32/48 monospace columns at normal font size. */
function columnsFor(printerWidthMm: number): number {
  return printerWidthMm === 58 ? 32 : 48;
}

function money(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Right-pads/truncates a label and right-aligns an amount within `width` columns. */
function row(label: string, amount: string, width: number): string {
  const gap = Math.max(1, width - label.length - amount.length);
  return label.slice(0, width - amount.length - 1) + " ".repeat(gap) + amount;
}

export function buildKitchenTicketEscpos(
  entries: KitchenTicketEntry[],
  printerWidthMm: number,
): Uint8Array {
  const cols = columnsFor(printerWidthMm);
  const b = new EscposBuilder().init();
  entries.forEach((entry, i) => {
    writeTicket(b, entry.ticket, entry.station, cols);
    b.feed(3).cut();
    if (i < entries.length - 1) b.feed(1);
  });
  return b.build();
}

function writeTicket(b: EscposBuilder, order: KitchenTicketOrder, station: string, cols: number) {
  const sourceLabel: Record<string, string> = {
    STAFF: "Staff order",
    CUSTOMER_QR: "Customer order",
    CASHIER: "Cashier order",
  };
  b.align("center")
    .bold(true)
    .line(`${station.toUpperCase()} ORDER`)
    .bold(false)
    .big(true)
    .line(`TABLE ${order.tableCode}`)
    .big(false)
    .line(sourceLabel[order.source] ?? order.source)
    .line(new Date(order.createdAt).toLocaleString())
    .align("left")
    .hr(cols, "=");

  for (const item of order.items) {
    b.bold(true).line(`${item.quantity}x ${item.nameEn}`).bold(false);
    for (const name of item.modifierNames) b.line(`  + ${name}`);
    for (const cs of item.comboSelections) b.line(`  ${cs.slotNameEn}: ${cs.nameEn}`);
    if (item.notes) b.line(`  Note: ${item.notes}`);
  }

  if (order.notes) {
    b.hr(cols, "-").line(`Order note: ${order.notes}`);
  }
}

/** A table's customer-facing "scan to order" slip (§6) — same content as
 * the browser print area in table-detail.tsx, printed via the bridge
 * instead when configured. The printer renders the QR code itself from
 * the URL text (see EscposBuilder.qrCode above), not an embedded image. */
export function buildQrSlipEscpos(opts: {
  cafeName: string;
  tableCode: string;
  url: string;
}): Uint8Array {
  const b = new EscposBuilder().init();
  b.align("center")
    .bold(true)
    .line(opts.cafeName)
    .bold(false)
    .line(`Table ${opts.tableCode} - Scan to order`)
    .feed(1)
    .qrCode(opts.url)
    .feed(3)
    .cut();
  return b.build();
}

export interface EscposReceiptSnapshot {
  receiptNumber: string;
  table: { code: string; name: string };
  players: number;
  tableFeeLines?: { playerId: string; billableMinutes: number; fee: number }[];
  pricingModel?: string;
  itemsByCategory?: {
    categoryName: string;
    subtotal: number;
    items: { nameEn: string; quantity: number; lineTotal: number }[];
  }[];
  foodDrinkItems?: { nameEn: string; quantity: number; lineTotal: number }[];
  discounts: { label: string; amount: number }[];
  bill: {
    subtotalTableFee: number;
    subtotalFoodDrink: number;
    discountTotal: number;
    serviceChargeAmount: number;
    taxAmount: number;
    total: number;
  };
  payments: { method: string; amount: number; cashReceived?: number; change?: number }[];
  member: { adventurerName: string; memberCode?: string } | null;
  expAwarded: number;
  staff: string;
  closedAt: string;
}

export function buildReceiptEscpos(
  snapshot: EscposReceiptSnapshot,
  opts: { cafeName: string; receiptFooter: string; printerWidthMm: number },
): Uint8Array {
  const cols = columnsFor(opts.printerWidthMm);
  const b = new EscposBuilder().init();

  b.align("center")
    .bold(true)
    .big(true)
    .line(opts.cafeName)
    .big(false)
    .bold(false)
    .line(`Receipt #${snapshot.receiptNumber}`)
    .line(`Table ${snapshot.table.code} · ${snapshot.players} player${snapshot.players === 1 ? "" : "s"}`)
    .line(new Date(snapshot.closedAt).toLocaleString())
    .align("left")
    .hr(cols, "=");

  if (snapshot.tableFeeLines && snapshot.tableFeeLines.length > 0) {
    b.line("Table fee");
    for (const l of snapshot.tableFeeLines) {
      b.line(row(`  ${l.billableMinutes} min`, money(l.fee), cols));
    }
  }

  const categories =
    snapshot.itemsByCategory ??
    (snapshot.foodDrinkItems && snapshot.foodDrinkItems.length > 0
      ? [{ categoryName: "Food/drink", subtotal: snapshot.bill.subtotalFoodDrink, items: snapshot.foodDrinkItems }]
      : []);
  for (const cat of categories) {
    if (cat.items.length === 0) continue;
    b.hr(cols, "-").line(cat.categoryName);
    for (const item of cat.items) {
      b.line(row(`  ${item.quantity}x ${item.nameEn}`, money(item.lineTotal), cols));
    }
  }

  if (snapshot.discounts.length > 0) {
    b.hr(cols, "-");
    for (const d of snapshot.discounts) {
      b.line(row(d.label, `-${money(d.amount)}`, cols));
    }
  }

  b.hr(cols, "=");
  if (snapshot.bill.subtotalTableFee > 0) {
    b.line(row("Table fee subtotal", money(snapshot.bill.subtotalTableFee), cols));
  }
  if (snapshot.bill.subtotalFoodDrink > 0) {
    b.line(row("Food/drink subtotal", money(snapshot.bill.subtotalFoodDrink), cols));
  }
  if (snapshot.bill.discountTotal > 0) {
    b.line(row("Discount", `-${money(snapshot.bill.discountTotal)}`, cols));
  }
  if (snapshot.bill.serviceChargeAmount > 0) {
    b.line(row("Service charge", money(snapshot.bill.serviceChargeAmount), cols));
  }
  if (snapshot.bill.taxAmount > 0) {
    b.line(row("Tax", money(snapshot.bill.taxAmount), cols));
  }
  b.bold(true).big(true).line(row("TOTAL", money(snapshot.bill.total), cols)).big(false).bold(false);

  b.hr(cols, "-");
  for (const p of snapshot.payments) {
    b.line(row(p.method, money(p.amount), cols));
    if (p.cashReceived != null) b.line(row("  Cash received", money(p.cashReceived), cols));
    if (p.change != null) b.line(row("  Change", money(p.change), cols));
  }

  if (snapshot.member) {
    b.hr(cols, "-")
      .line(`Member: ${snapshot.member.adventurerName}`)
      .line(`+${snapshot.expAwarded} EXP`);
  }

  b.hr(cols, "=").align("center").line(`Served by ${snapshot.staff}`);
  if (opts.receiptFooter) b.line(opts.receiptFooter);
  b.feed(3).cut();

  return b.build();
}

export interface PrintBridgeTarget {
  bridgeUrl: string;
  ip: string;
  port: number;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * POSTs raw ESC/POS bytes to the local print-bridge program (see
 * print-bridge/server.js), which relays them to the printer over a plain
 * TCP socket. The bridge runs on the user's own LAN (a PC/Mac left
 * running), reachable from the iPad over plain HTTP — browsers can make
 * fetch() calls to a local IP even though they can't open a raw TCP
 * socket themselves.
 */
export async function printViaBridge(bytes: Uint8Array, target: PrintBridgeTarget): Promise<void> {
  const url = `${target.bridgeUrl.replace(/\/+$/, "")}/print`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: target.ip, port: target.port, data: base64FromBytes(bytes) }),
    });
  } catch {
    throw new Error(`Couldn't reach the print bridge at ${target.bridgeUrl}. Is it running?`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Print bridge returned ${res.status}`);
  }
}
