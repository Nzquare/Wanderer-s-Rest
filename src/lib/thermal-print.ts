import { printOnce } from "./print-once";
import {
  buildInvoiceEscpos,
  buildKitchenTicketEscpos,
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

/** Same idea as printKitchenTicket, for the receipt. */
export function printReceipt(
  snapshot: EscposReceiptSnapshot,
  receiptOpts: { cafeName: string; receiptFooter: string },
  settings: CheckoutSettings | undefined,
  show: () => void,
  hide: () => void,
  onBridgeError?: (message: string) => void,
): () => void {
  const target = bridgeTargetFrom(settings);
  if (target) {
    const bytes = buildReceiptEscpos(snapshot, {
      ...receiptOpts,
      printerWidthMm: settings?.printerWidthMm ?? 80,
    });
    printViaBridge(bytes, target).catch((err: Error) => onBridgeError?.(err.message));
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
