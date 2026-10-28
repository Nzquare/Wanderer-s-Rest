import Link from "next/link";
import { logoutAction } from "@/server/auth/actions";
import type { CurrentStaff } from "@/server/auth/current-user";
import type { CafeSettings } from "@/server/settings/schema";
import { canAccessBackOffice } from "@/server/rbac/can";
import { pickLogo } from "@/lib/pick-logo";
import { OrderAlertBanner } from "@/components/pos/order-alert-banner";
import { StaleShiftBanner } from "@/components/pos/stale-shift-banner";
import { NavLink } from "./nav-link";

const NAV_ITEMS = [
  // Shift leads the nav (§Shift-first nav) — opening a table requires an
  // open shift (§47), so putting it first is a standing reminder to open
  // one before anything else, rather than staff discovering the block
  // only after they've already tried to seat a table.
  { href: "/cashier/shift", label: "Shift" },
  { href: "/cashier/clock", label: "Clock In/Out" },
  { href: "/cashier", label: "Tables" },
  { href: "/cashier/quick-sale", label: "Quick Sale" },
  { href: "/cashier/members", label: "Members" },
  { href: "/cashier/reservations", label: "Reservations" },
];

// Cashier is the operational control center (§3) — clean, fast, no fantasy
// styling. Big tappable nav, status/shift info always visible up top.
export function CashierShell({
  staff,
  cafe,
  children,
}: {
  staff: CurrentStaff;
  cafe: CafeSettings;
  children: React.ReactNode;
}) {
  const logo = pickLogo(cafe, "dark");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="pt-safe-header flex items-center justify-between gap-4 bg-brand-950 px-4 py-3 text-white">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-wide text-teal-400">
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-16 w-16 object-contain" />
            )}
            Cashier
          </span>
          <nav className="hidden gap-1 sm:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                exact={item.href === "/cashier"}
                activeMatchPrefix={item.href === "/cashier" ? "/cashier/tables" : undefined}
                className="rounded-lg px-3 py-2 text-sm"
                activeClassName="bg-teal-500/15 text-teal-300 font-medium"
                inactiveClassName="text-white/80 hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </NavLink>
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
          <NavLink
            key={item.href}
            href={item.href}
            exact={item.href === "/cashier"}
            activeMatchPrefix={item.href === "/cashier" ? "/cashier/tables" : undefined}
            className="flex-1 rounded-lg px-2 py-2 text-center text-sm font-medium"
            activeClassName="bg-teal-500/10 text-teal-700 dark:text-teal-300"
            inactiveClassName="text-foreground-muted hover:bg-black/5"
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <StaleShiftBanner />
      <OrderAlertBanner />
      <main className="flex-1 p-3 md:p-6">{children}</main>
    </div>
  );
}
