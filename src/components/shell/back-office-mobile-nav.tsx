"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * The mobile header's "Menu" used to just be a plain `<Link href="/">` —
 * on phones (where the desktop `<aside>` sidebar is `hidden`) that meant
 * there was no way to reach any Back Office section other than Tables/
 * whatever page a bookmark/URL happened to point at, and no way to sign
 * out either. This is the actual nav: a slide-out drawer with the same
 * permission-filtered items as the desktop sidebar, plus the app
 * switcher links and sign-out that only lived in the sidebar before.
 */
export function BackOfficeMobileNav({
  items,
  staffLabel,
  showCashier,
  showStaffMobile,
  logoutAction,
}: {
  items: { href: string; label: string }[];
  staffLabel: string;
  showCashier: boolean;
  showStaffMobile: boolean;
  logoutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-teal-600"
        aria-label="Open navigation menu"
        aria-expanded={open}
      >
        <span aria-hidden className="text-lg leading-none">☰</span>
        Menu
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          {/* Backdrop tap-to-close, not a control. */}
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <nav className="pt-safe-header relative ml-auto flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-brand-950 p-4 text-white/90 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Menu</p>
              <button
                type="button"
                onClick={close}
                className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 space-y-0.5">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  className="block rounded-lg px-3 py-2.5 text-sm text-white/75 hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>
            {(showCashier || showStaffMobile) && (
              <div className="space-y-1 border-t border-white/10 pt-3 text-sm">
                {showCashier && (
                  <Link href="/cashier" onClick={close} className="block px-3 py-1 text-teal-400 hover:text-teal-300">
                    Cashier POS →
                  </Link>
                )}
                {showStaffMobile && (
                  <Link href="/staff" onClick={close} className="block px-3 py-1 text-teal-400 hover:text-teal-300">
                    Staff Mobile →
                  </Link>
                )}
              </div>
            )}
            <div className="border-t border-white/10 pt-3">
              <p className="px-3 text-xs text-white/50">{staffLabel}</p>
              <form action={logoutAction}>
                <button className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-white/60 hover:bg-white/10 hover:text-white">
                  Sign out
                </button>
              </form>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
