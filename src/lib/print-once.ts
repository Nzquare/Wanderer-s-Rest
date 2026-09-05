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
 * iOS — the native share/print sheet can be left open for a while, e.g.
 * a cashier holding up a PromptPay QR or a printed invoice for a
 * customer to read before moving on) — a timeout also force-finishes a
 * job as a fallback, so a missed event can't wedge the whole queue
 * forever. That fallback alone isn't enough on its own, though: if a
 * cashier's own next action (e.g. confirming payment, which switches the
 * checkout screen straight to the receipt) makes an earlier queued job's
 * print area disappear from the page entirely before that timeout ever
 * fires, the queue would sit there for the rest of the timeout window
 * waiting on content that no longer exists — and calling window.print()
 * again once it *does* move on, while whatever native dialog the earlier
 * job opened might still be sitting on screen, is exactly the kind of
 * overlapping-print-call situation browsers behave inconsistently for
 * (silently ignoring the second call, or showing it before it's actually
 * populated) — which reads as "confirmed payment, but the receipt just
 * printed blank" (§confirm payment, nothing prints). printOnce returns a
 * cancel function for exactly that: a caller whose print area is about
 * to stop being relevant (case in point: checkout-client.tsx's invoice/
 * QR print area, right when payment is confirmed and the screen swaps to
 * the receipt) can release its own place in the queue immediately,
 * instead of leaving the next job to wait out the timeout.
 *
 * That cancellation alone still wasn't enough (§confirm payment, nothing
 * prints — round 2, cash): releasing our own queue bookkeeping doesn't
 * tell the browser/OS that the *previous* window.print() call is done
 * settling — on the async-handoff browsers described above, the earlier
 * native dialog/share sheet can still be transitioning onto the screen at
 * the exact moment the next job calls window.print() again, which is the
 * overlapping-call situation flagged above and produced exactly that
 * pattern: a dialog opens for the receipt, but it's blank, because the
 * print engine was still busy with the invoice/QR job a moment before.
 * runNext below gives every job a short pause between committing its own
 * content (flushSync) and actually calling window.print(), so a job that
 * starts immediately after another was just force-finished has a beat
 * for that to actually settle first, instead of firing right on top of it.
 */
interface PrintJob {
  show: () => void;
  hide: () => void;
}

let current: PrintJob | null = null;
let currentFinish: (() => void) | null = null;
const queue: PrintJob[] = [];

function runNext() {
  const job = queue.shift();
  if (!job) {
    current = null;
    currentFinish = null;
    return;
  }
  current = job;
  let settled = false;
  let printTimeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(finishTimeoutId);
    clearTimeout(printTimeoutId);
    window.removeEventListener("afterprint", finish);
    currentFinish = null;
    job.hide();
    runNext();
  };
  currentFinish = finish;
  window.addEventListener("afterprint", finish, { once: true });
  const finishTimeoutId = setTimeout(finish, 3000);
  flushSync(job.show);
  // The pause itself (see the doc comment above) — not "wait for the
  // previous dialog to close" (there's no reliable cross-browser signal
  // for that), just enough of a gap that this job's own window.print()
  // never lands in the exact same tick as a just-force-finished one's.
  printTimeoutId = setTimeout(() => window.print(), 400);
}

/**
 * @returns a function the caller can invoke to give up its place in the
 * queue — a no-op if this job already finished on its own, removes it
 * from the queue if it hadn't started yet, or force-finishes it (freeing
 * the queue for whatever's next) if it was the one actually printing.
 */
export function printOnce(show: () => void, hide: () => void): () => void {
  const job: PrintJob = { show, hide };
  queue.push(job);
  if (!current) runNext();
  return () => {
    const idx = queue.indexOf(job);
    if (idx !== -1) {
      queue.splice(idx, 1);
      return;
    }
    if (current === job) currentFinish?.();
  };
}
