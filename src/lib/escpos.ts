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

  /** GS v 0 — prints a 1-bit monochrome raster image (the café logo).
   * `widthBytes` is the row width in BYTES (8 px/byte, MSB first), not
   * pixels — see rasterizeLogo below, which already produces data in
   * this packed form. */
  rasterImage(widthBytes: number, heightPx: number, bits: Uint8Array): this {
    this.push(
      GS,
      0x76,
      0x30,
      0x00,
      widthBytes & 0xff,
      (widthBytes >> 8) & 0xff,
      heightPx & 0xff,
      (heightPx >> 8) & 0xff,
    );
    this.chunks.push(bits);
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

/** Whole baht, no decimals — matches every on-screen bill/receipt figure
 * in the app (all use .toFixed(0)), unlike this printer's own raw
 * numbers (e.g. a rank discount computed as a straight percentage —
 * ฿175 * 5% — comes out to 8.75, not a whole number) which would
 * otherwise print with decimals the app itself never shows. */
function money(amount: number): string {
  return Math.round(amount).toLocaleString();
}

/** Right-pads/truncates a label and right-aligns an amount within `width` columns. */
function row(label: string, amount: string, width: number): string {
  const gap = Math.max(1, width - label.length - amount.length);
  return label.slice(0, width - amount.length - 1) + " ".repeat(gap) + amount;
}

/** Same rounding/formatting as receipt-view.tsx's formatMinutesShort —
 * duplicated here (rather than imported) since that one lives in a React
 * component module and this file has no React dependency otherwise.
 * billableMinutes/elapsed-time values carry fractional minutes (computed
 * from a live duration in ms), so printing them raw showed up as e.g.
 * "21.54195 min" instead of a clean whole number. */
interface LogoRaster {
  widthBytes: number;
  heightPx: number;
  bits: Uint8Array;
}

/**
 * Loads the café logo and converts it to a 1-bit monochrome ESC/POS
 * raster image (see EscposBuilder.rasterImage), resized to fit
 * `maxWidthPx` wide. There's no "print an image" ESC/POS command — this
 * is the actual command set's own way of putting a picture on the
 * paper, so the logo isn't just left off the thermal receipt the way an
 * unsupported Thai character would be.
 *
 * Runs entirely in the browser (Canvas API) since the print bridge only
 * relays bytes — it has no way to decode or resize an image itself,
 * so all of that has to happen client-side before the bytes are sent.
 * Returns null (never throws) if the image can't be loaded — a missing
 * file or a remote URL blocked by CORS shouldn't stop the rest of the
 * receipt from printing, just the logo.
 */
async function rasterizeLogo(url: string, maxWidthPx: number): Promise<LogoRaster | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("logo image failed to load"));
      el.src = url;
    });
    if (!img.naturalWidth || !img.naturalHeight) return null;

    const scale = Math.min(1, maxWidthPx / img.naturalWidth);
    const drawWidthPx = Math.max(1, Math.round(img.naturalWidth * scale));
    const heightPx = Math.max(1, Math.round(img.naturalHeight * scale));
    // Raster rows are byte-packed, 8 pixels per byte — round the canvas
    // width up to a multiple of 8 (padded with white) rather than
    // distort the image to fit exactly.
    const widthBytes = Math.ceil(drawWidthPx / 8);
    const widthPx = widthBytes * 8;

    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.drawImage(img, 0, 0, drawWidthPx, heightPx);
    const { data } = ctx.getImageData(0, 0, widthPx, heightPx);

    const bits = new Uint8Array(widthBytes * heightPx);
    for (let y = 0; y < heightPx; y++) {
      for (let xByte = 0; xByte < widthBytes; xByte++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = xByte * 8 + bit;
          const idx = (y * widthPx + x) * 4;
          const alpha = data[idx + 3];
          // Transparent pixels (common around a logo's edges) count as
          // blank/white, not black — a plain luminance threshold
          // otherwise. No dithering: a logo's bold shapes read fine on
          // a 1-bit thermal printer without it, and dithering would
          // just add noise at this resolution.
          const luminance = alpha === 0 ? 255 : 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          if (luminance < 128) byte |= 0x80 >> bit;
        }
        bits[y * widthBytes + xByte] = byte;
      }
    }
    return { widthBytes, heightPx, bits };
  } catch {
    return null;
  }
}

function formatMinutesShort(totalMinutes: number): string {
  const whole = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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

/** The customer-facing PromptPay "scan to pay" slip at checkout — same
 * content as the browser print area in checkout-client.tsx. `qrValue`
 * is the EMVCo-format PromptPay payload string (built by
 * buildPromptPayPayload), not a URL — the printer's QR command encodes
 * whatever text data it's given, so this is no different from the table
 * QR slip above. */
export function buildPromptPayQrEscpos(opts: {
  cafeName: string;
  tableCode: string;
  qrAmount: number;
  qrValue: string;
}): Uint8Array {
  const b = new EscposBuilder().init();
  b.align("center")
    .bold(true)
    .line(opts.cafeName)
    .bold(false)
    .line(`Table ${opts.tableCode}`)
    .feed(1)
    .qrCode(opts.qrValue)
    .feed(1)
    .bold(true)
    .line(`Scan to pay THB ${opts.qrAmount.toFixed(2)}`)
    .bold(false)
    .line("PromptPay - show staff once paid")
    .feed(3)
    .cut();
  return b.build();
}

export interface EscposInvoiceSnapshot {
  table: { code: string };
  /** Caller computes these the same way the on-screen bill does
   * (checkout-client.tsx's own isHourly/showAllDay) rather than this
   * file re-deriving them from pricingModel, so both stay in sync with
   * exactly one source of truth. */
  isHourly: boolean;
  showAllDay: boolean;
  tableFeeLines: {
    playerId: string;
    billableMinutes: number;
    fee: number;
    cappedAtDailyCap?: boolean;
    pricingTypeName?: string | null;
  }[];
  itemsByCategory: {
    categoryName: string;
    items: { nameEn: string; quantity: number; lineTotal: number }[];
  }[];
  appliedDiscounts: { label: string; amount: number; isFreeItem?: boolean; isExpBonus?: boolean }[];
  bill: { subtotalTableFee: number; serviceChargeAmount: number; taxAmount: number; total: number };
}

/** The pre-payment "Print Invoice" slip at checkout (not a receipt — the
 * guest reviews/pays at the counter, same wording as the on-screen
 * card). Mirrors checkout-client.tsx's #invoice-print-area markup,
 * built from the same checkout preview data. */
export function buildInvoiceEscpos(
  snapshot: EscposInvoiceSnapshot,
  opts: { cafeName: string; printerWidthMm: number },
): Uint8Array {
  const cols = columnsFor(opts.printerWidthMm);
  const b = new EscposBuilder().init();

  b.align("center")
    .bold(true)
    .line(opts.cafeName)
    .bold(false)
    .line(`Invoice - Table ${snapshot.table.code}`)
    .line(new Date().toLocaleString())
    .align("left")
    .hr(cols, "=");

  b.line(row(snapshot.showAllDay ? "All day" : "Playtime", money(snapshot.bill.subtotalTableFee), cols));
  if (snapshot.isHourly && snapshot.tableFeeLines.length > 1) {
    snapshot.tableFeeLines.forEach((line, i) => {
      const label = `  P${i + 1}${line.pricingTypeName ? ` (${line.pricingTypeName})` : ""}`;
      const detail = line.cappedAtDailyCap ? "All day" : formatMinutesShort(line.billableMinutes);
      b.line(row(`${label} ${detail}`, money(line.fee), cols));
    });
  }

  for (const cat of snapshot.itemsByCategory) {
    if (cat.items.length === 0) continue;
    for (const item of cat.items) {
      b.line(row(`${item.quantity}x ${item.nameEn}`, money(item.lineTotal), cols));
    }
  }

  for (const d of snapshot.appliedDiscounts) {
    if (d.isFreeItem) b.line(`+ ${d.label}`);
    else if (d.isExpBonus) b.line(`* ${d.label}`);
    else b.line(row(d.label, `-${money(d.amount)}`, cols));
  }

  if (snapshot.bill.serviceChargeAmount > 0) {
    b.line(row("Service charge", money(snapshot.bill.serviceChargeAmount), cols));
  }
  if (snapshot.bill.taxAmount > 0) {
    b.line(row("Tax", money(snapshot.bill.taxAmount), cols));
  }

  b.hr(cols, "=")
    .bold(true)
    .line(row("TOTAL", money(snapshot.bill.total), cols))
    .bold(false)
    .align("center")
    .line("This is not a receipt - pay at the counter.")
    .feed(3)
    .cut();

  return b.build();
}

export interface EscposReceiptSnapshot {
  receiptNumber: string;
  table: { code: string; name: string };
  players: number;
  tableFeeLines?: {
    playerId: string;
    billableMinutes: number;
    fee: number;
    cappedAtDailyCap?: boolean;
    pricingTypeName?: string | null;
  }[];
  pricingModel?: string;
  /** Computed by the caller the same way the on-screen receipt computes
   * them (receipt-view.tsx's own isHourly/showAllDay), rather than
   * re-derived here, so both stay in sync with one source of truth. */
  isHourly: boolean;
  showAllDay: boolean;
  itemsByCategory?: {
    categoryName: string;
    subtotal: number;
    items: { nameEn: string; quantity: number; lineTotal: number }[];
  }[];
  foodDrinkItems?: { nameEn: string; quantity: number; lineTotal: number }[];
  discounts: { label: string; amount: number; isFreeItem?: boolean; isExpBonus?: boolean }[];
  bill: {
    subtotalTableFee: number;
    subtotalFoodDrink: number;
    serviceChargeAmount: number;
    taxAmount: number;
    total: number;
  };
  payments: { method: string; amount: number; cashReceived?: number; change?: number }[];
  member: {
    adventurerName: string;
    memberCode?: string;
    classNameEn?: string | null;
  } | null;
  expAwarded: number;
  lifetimeExpAfter?: number | null;
  levelAfter?: number | null;
  rankNameAfter?: string | null;
  unlockedAchievements?: { nameEn: string }[];
  staff: string;
  closedAt: string;
}

export async function buildReceiptEscpos(
  snapshot: EscposReceiptSnapshot,
  opts: { cafeName: string; receiptFooter: string; printerWidthMm: number; logoUrl?: string | null },
): Promise<Uint8Array> {
  const cols = columnsFor(opts.printerWidthMm);
  const b = new EscposBuilder().init();

  b.align("center");
  if (opts.logoUrl) {
    // 576/384 dots is the standard 203dpi print width for 80mm/58mm
    // paper — leaves a small margin either side rather than filling the
    // printer's absolute maximum.
    const maxWidthPx = opts.printerWidthMm === 58 ? 320 : 480;
    const logo = await rasterizeLogo(opts.logoUrl, maxWidthPx);
    if (logo) b.rasterImage(logo.widthBytes, logo.heightPx, logo.bits).feed(1);
  }
  b.bold(true)
    .line(opts.cafeName)
    .bold(false)
    .line(`Receipt #${snapshot.receiptNumber}`)
    .line(new Date(snapshot.closedAt).toLocaleString())
    .align("left")
    .hr(cols, "=");

  b.line(`Table ${snapshot.table.code} - ${snapshot.players} player${snapshot.players === 1 ? "" : "s"}`);
  b.line(`Staff: ${snapshot.staff}`);
  if (snapshot.member) {
    b.line(`Member: ${snapshot.member.adventurerName}`);
    if (snapshot.member.classNameEn) b.line(`Class: ${snapshot.member.classNameEn}`);
    b.bold(true).line(`+${snapshot.expAwarded} EXP`).bold(false);
    if (snapshot.lifetimeExpAfter != null && snapshot.levelAfter != null) {
      const rank = snapshot.rankNameAfter ? ` - ${snapshot.rankNameAfter}` : "";
      b.line(`Total ${snapshot.lifetimeExpAfter} EXP - Level ${snapshot.levelAfter}${rank}`);
    }
  }
  b.hr(cols, "-");

  if (snapshot.bill.subtotalTableFee > 0) {
    const playtimeMinutes =
      snapshot.tableFeeLines && snapshot.tableFeeLines.length > 0
        ? Math.max(...snapshot.tableFeeLines.map((l) => l.billableMinutes))
        : null;
    const playtimeLabel = snapshot.showAllDay
      ? "All day"
      : playtimeMinutes != null
        ? `Playtime (${formatMinutesShort(playtimeMinutes)})`
        : "Playtime";
    b.line(row(playtimeLabel, money(snapshot.bill.subtotalTableFee), cols));
    if (snapshot.isHourly && snapshot.tableFeeLines && snapshot.tableFeeLines.length > 1) {
      snapshot.tableFeeLines.forEach((l, i) => {
        const label = `  P${i + 1}${l.pricingTypeName ? ` (${l.pricingTypeName})` : ""}`;
        const detail = l.cappedAtDailyCap ? "All day" : formatMinutesShort(l.billableMinutes);
        b.line(row(`${label} ${detail}`, money(l.fee), cols));
      });
    }
  }

  const categories =
    snapshot.itemsByCategory ??
    (snapshot.foodDrinkItems && snapshot.foodDrinkItems.length > 0
      ? [{ categoryName: "Food/drink", subtotal: snapshot.bill.subtotalFoodDrink, items: snapshot.foodDrinkItems }]
      : []);
  for (const cat of categories) {
    if (cat.items.length === 0) continue;
    b.line(row(cat.categoryName, money(cat.subtotal), cols));
    for (const item of cat.items) {
      b.line(row(`  ${item.quantity}x ${item.nameEn}`, money(item.lineTotal), cols));
    }
  }

  b.bold(true)
    .line(row("Subtotal", money(snapshot.bill.subtotalTableFee + snapshot.bill.subtotalFoodDrink), cols))
    .bold(false);

  for (const d of snapshot.discounts.filter((d) => d.isFreeItem)) b.line(`+ ${d.label}`);
  for (const d of snapshot.discounts.filter((d) => d.isExpBonus)) b.line(`* ${d.label}`);
  for (const d of snapshot.discounts.filter((d) => !d.isFreeItem && !d.isExpBonus)) {
    b.line(row(d.label, `-${money(d.amount)}`, cols));
  }
  if (snapshot.bill.serviceChargeAmount > 0) {
    b.line(row("Service charge", money(snapshot.bill.serviceChargeAmount), cols));
  }
  if (snapshot.bill.taxAmount > 0) {
    b.line(row("Tax", money(snapshot.bill.taxAmount), cols));
  }

  b.hr(cols, "=")
    .bold(true)
    .line(row("TOTAL", money(snapshot.bill.total), cols))
    .bold(false)
    .hr(cols, "-");

  for (const p of snapshot.payments) {
    b.line(row(p.method, money(p.amount), cols));
    if (p.cashReceived != null) b.line(row("  Received", money(p.cashReceived), cols));
    if (p.change != null && p.change > 0) b.line(row("  Change", money(p.change), cols));
  }

  if (snapshot.member) {
    b.hr(cols, "-").align("center").line(`EXP earned: +${snapshot.expAwarded}`).align("left");
  }

  if (snapshot.unlockedAchievements && snapshot.unlockedAchievements.length > 0) {
    b.hr(cols, "-").align("center").bold(true).line("Achievement Unlocked").bold(false);
    for (const a of snapshot.unlockedAchievements) b.line(a.nameEn);
    b.align("left");
  }

  b.align("center");
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
