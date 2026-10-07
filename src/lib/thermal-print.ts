import { printOnce } from "./print-once";
import {
  buildInvoiceEscpos,
  buildKitchenTicketEscpos,
  buildOpenDrawerEscpos,
  buildPromptPayQrEscpos,
  buildQrSlipEscpos,
  buildReceiptEscpos,
  printViaBridge,
  type EscposInvoiceSnapshot,
  type EscposReceiptSnapshot,
  type PrintBridgeTarget,
} from "./escpos";
import type { KitchenTicketEntry } from "@/components/pos/kitchen-ticket";
import type { CheckoutSettings } from "@/server/settings/schema";

/** Network print bridge target, or null when it isn't configured — see
 * Back Office → Settings → Checkout → Network thermal printer. */
export function bridgeTargetFrom(
  settings: CheckoutSettings | undefined,
): PrintBridgeTarget | null {
  if (!settings?.printBridgeUrl || !settings?.thermalPrinterIp) return null;
  return {
    bridgeUrl: settings.printBridgeUrl,
    ip: settings.thermalPrinterIp,
    port: settings.thermalPrinterPort,
  };
}

/**
 * Prints a kitchen ticket through the network print bridge (raw ESC/POS,
 * no browser dialog) when one's configured, otherwise falls back to the
 * normal browser printOnce/window.print() flow unchanged (§Network
 * thermal printer / print bridge). `onBridgeError` reports a failed
 * bridge request (printer unreachable, bridge not running, etc.) since
 * this is called from plain button handlers with no surrounding
 * try/catch. Returns a cancel function, matching printOnce's — a no-op
 * when printed via the bridge, since there's no browser dialog/queue
 * slot to release.
 */
export function printKitchenTicket<T extends KitchenTicketEntry[]>(
  entries: T,
  settings: CheckoutSettings | undefined,
  show: (entries: T) => void,
  hide: () => void,
  onBridgeError?: (message: string) => void,
): () => void {
  const target = bridgeTargetFrom(settings);
  if (target) {
    const bytes = buildKitchenTicketEscpos(entries, settings?.printerWidthMm ?? 80);
    printViaBridge(bytes, target).catch((err: Error) => onBridgeError?.(err.message));
    return () => {};
  }
  return printOnce(
    () => show(entries),
    hide,
  );
}

/** Same idea as printKitchenTicket, for the receipt. Building the bytes
 * is async here (unlike the other print*  helpers) since it may need to
 * fetch/rasterize the café logo — still returns its cancel function
 * synchronously, matching every other call in this file, since there's
 * nothing meaningful to cancel either way once the bridge path is taken. */
export function printReceipt(
  snapshot: EscposReceiptSnapshot,
  receiptOpts: { cafeName: string; receiptFooter: string; logoUrl?: string | null },
  settings: CheckoutSettings | undefined,
  show: () => void,
  hide: () => void,
  onBridgeError?: (message: string) => void,
): () => void {
  const target = bridgeTargetFrom(settings);
  if (target) {
    buildReceiptEscpos(snapshot, {
      ...receiptOpts,
      printerWidthMm: settings?.printerWidthMm ?? 80,
    })
      .then((bytes) => printViaBridge(bytes, target))
      .catch((err: Error) => onBridgeError?.(err.message));
    return () => {};
  }
  return printOnce(show, hide);
}

/** Same idea as printKitchenTicket, for the pre-payment invoice slip. */
export function printInvoice(
  snapshot: EscposInvoiceSnapshot,
  invoiceOpts: { cafeName: string },
  settings: CheckoutSettings | undefined,
  show: () => void,
  hide: () => void,
  onBridgeError?: (message: string) => void,
): () => void {
  const target = bridgeTargetFrom(settings);
  if (target) {
    const bytes = buildInvoiceEscpos(snapshot, {
      ...invoiceOpts,
      printerWidthMm: settings?.printerWidthMm ?? 80,
    });
    printViaBridge(bytes, target).catch((err: Error) => onBridgeError?.(err.message));
    return () => {};
  }
  return printOnce(show, hide);
}

/** Same idea as printKitchenTicket, for the customer-facing PromptPay
 * "scan to pay" slip. */
export function printPromptPayQr(
  slip: { cafeName: string; tableCode: string; qrAmount: number; qrValue: string },
  settings: CheckoutSettings | undefined,
  show: () => void,
  hide: () => void,
  onBridgeError?: (message: string) => void,
): () => void {
  const target = bridgeTargetFrom(settings);
  if (target) {
    const bytes = buildPromptPayQrEscpos(slip);
    printViaBridge(bytes, target).catch((err: Error) => onBridgeError?.(err.message));
    return () => {};
  }
  return printOnce(show, hide);
}

/** Same idea as printKitchenTicket, for a table's "scan to order" QR slip. */
export function printQrSlip(
  slip: { cafeName: string; tableCode: string; url: string },
  settings: CheckoutSettings | undefined,
  show: () => void,
  hide: () => void,
  onBridgeError?: (message: string) => void,
): () => void {
  const target = bridgeTargetFrom(settings);
  if (target) {
    const bytes = buildQrSlipEscpos(slip);
    printViaBridge(bytes, target).catch((err: Error) => onBridgeError?.(err.message));
    return () => {};
  }
  return printOnce(show, hide);
}

/**
 * Kicks the cash drawer (§automatic cash drawer open) — unlike every
 * other print* helper here, there's no browser fallback at all: a
 * drawer has no AirPrint/print-dialog equivalent, it only ever opens
 * via the printer's own kick-out port. So this is simply a no-op (not
 * an error) when no bridge is configured — a café that never set one up
 * just never gets this bonus, same as not printing kitchen tickets
 * through it either.
 */
export function openCashDrawer(
  settings: CheckoutSettings | undefined,
  onBridgeError?: (message: string) => void,
): void {
  const target = bridgeTargetFrom(settings);
  if (!target) return;
  printViaBridge(buildOpenDrawerEscpos(), target).catch((err: Error) => onBridgeError?.(err.message));
}
