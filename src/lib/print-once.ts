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
 *
 * Every print job app-wide is also serialized through one queue here
 * (§sometimes the wrong thing gets printed) — the Cashier shell's
 * OrderAlertBanner polls every few seconds and can auto-print a kitchen
 * ticket the moment a new order lands, completely independent of
 * whatever else a cashier is doing on-screen at that instant (printing
 * an invoice at checkout, a table's QR slip, the post-payment receipt —
 * every one of those pages keeps the banner mounted too). Before this,
 * each of those called window.print() straight away, so two triggers
 * landing close together could both be "armed" (`print-area`/`print:block`)
 * at once. Not every browser blocks JS while its print dialog is open the
 * way a desktop one does — iOS in particular hands off to the native
 * AirPrint sheet asynchronously — so that overlap was reachable in
 * practice, not just in theory, and produced exactly this: whichever
 * print area happened to be armed when the browser actually rendered the
 * page, or both stacked on top of each other (every `.print-area` shares
 * `position: absolute; top: 0; left: 0`).
 *
 * Now a call while another job is still in flight just queues instead of
 * firing immediately — it shows/prints/hides in its turn, after the
 * current one finishes, so at most one print area is ever armed at once
 * no matter which two triggers happened to land close together.
 *
 * The `afterprint` event isn't fully reliable everywhere either (again,
 * iOS) — a short timeout also force-finishes a job as a fallback, so a
 * missed event can't wedge the whole queue. Worst case there: the queue
 * moves on a few seconds later than it ideally would, not "stuck".
 */
interface PrintJob {
  show: () => void;
  hide: () => void;
}

let current: PrintJob | null = null;
const queue: PrintJob[] = [];

function runNext() {
  const job = queue.shift();
  if (!job) {
    current = null;
    return;
  }
  current = job;
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    window.removeEventListener("afterprint", finish);
    job.hide();
    runNext();
  };
  window.addEventListener("afterprint", finish, { once: true });
  const timeoutId = setTimeout(finish, 8000);
  flushSync(job.show);
  window.print();
}

export function printOnce(show: () => void, hide: () => void) {
  queue.push({ show, hide });
  if (!current) runNext();
}
