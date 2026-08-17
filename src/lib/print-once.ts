"use client";

import { flushSync } from "react-dom";

/**
 * Flips a print area's local "visible" flag on, triggers window.print(),
 * then flips it back off once the print dialog actually closes — via the
 * `afterprint` event, not just "the line after window.print()", since
 * that call isn't guaranteed to block synchronously in every browser.
 *
 * Without the reset, a print area that only ever gets shown and never
 * hidden again stays `print:block` forever — silently overlapping every
 * later print job triggered from anywhere else on the same page (or, for
 * an area that lives in a shared shell like the Cashier layout, any later
 * print job on *any* Cashier page for the rest of the session). That's
 * the printer-overlap bug (§Printer bug — stale print area never
 * resets): a kitchen ticket printed once, then a table's QR code printed
 * later, both show up stacked on the same sheet. Every print trigger that
 * shares a page/shell with another one needs to go through this, not a
 * bare window.print().
 *
 * `flushSync` still matters here too — a plain setState wouldn't be
 * guaranteed to land in the DOM before window.print() reads it.
 */
export function printOnce(show: () => void, hide: () => void) {
  window.addEventListener("afterprint", hide, { once: true });
  flushSync(show);
  window.print();
}
