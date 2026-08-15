import Link from "next/link";
import { logoutAction } from "@/server/auth/actions";
import type { CurrentStaff } from "@/server/auth/current-user";
import { canAccessBackOffice } from "@/server/rbac/can";
import { OrderAlertBanner } from "@/components/pos/order-alert-banner";

const NAV_ITEMS = [
  { href: "/cashier", label: "Tables" },
  { href: "/cashier/quick-sale", label: "Quick Sale" },
  { href: "/cashier/reservations", label: "Reservations" },
  { href: "/cashier/shift", label: "Shift" },
];

// Cashier is the operational control center (§3) — clean, fast, no fantasy
// styling. Big tappable nav, status/shift info always visible up top.
export function CashierShell({
  staff,
  children,
}: {
  staff: CurrentStaff;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-4 bg-brand-950 px-4 py-3 text-white">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold tracking-wide text-teal-400">
            Cashier
          </span>
          <nav className="hidden gap-1 sm:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {canAccessBackOffice(staff) && (
            <Link href="/back-office" className="text-white/60 hover:text-white">
              Back Office
            </Link>
          )}
          <span className="hidden text-white/60 sm:inline">
            {staff.displayName ?? staff.name}
          </span>
          <form action={logoutAction}>
            <button className="rounded-lg px-3 py-2 text-white/60 hover:bg-white/10 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <nav className="flex gap-1 border-b border-border bg-surface px-2 py-2 sm:hidden">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 rounded-lg px-2 py-2 text-center text-sm font-medium text-foreground-muted hover:bg-black/5"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <OrderAlertBanner />
      <main className="flex-1 p-3 md:p-6">{children}</main>
    </div>
  );
}
