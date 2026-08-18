import Link from "next/link";
import { logoutAction } from "@/server/auth/actions";
import type { CurrentStaff } from "@/server/auth/current-user";
import { canAccessCashier, canAccessStaffMobile, can } from "@/server/rbac/can";
import { Permission } from "@/generated/prisma/enums";

// Each page's own data query is gated behind one of these (see the
// matching router's `manage()`/permissionProcedure call) — canAccessBackOffice
// only requires ANY of a handful of permissions to get in the door at all
// (e.g. a GM with just MANAGE_MEMBERS, or a Tavern Keeper with just
// MANAGE_GAMES), so most of these pages were reachable but permanently
// stuck on their own "Loading…" text for anyone without this specific one
// (§Back Office nav permission gating) — no error, just a query that 403'd
// forever. `permission: undefined` means every Back Office visitor can use
// it, no further check.
const NAV_ITEMS: { href: string; label: string; permission?: Permission }[] = [
  { href: "/back-office", label: "Dashboard" },
  { href: "/back-office/tables", label: "Tables", permission: Permission.MANAGE_TABLES },
  { href: "/back-office/pricing", label: "Pricing", permission: Permission.MANAGE_SETTINGS },
  { href: "/back-office/menu", label: "Menu", permission: Permission.MANAGE_MENU },
  { href: "/back-office/games", label: "Game Library", permission: Permission.MANAGE_GAMES },
  { href: "/back-office/members", label: "Members", permission: Permission.MANAGE_MEMBERS },
  { href: "/back-office/classes", label: "Classes", permission: Permission.MANAGE_SETTINGS },
  { href: "/back-office/ranks", label: "Ranks", permission: Permission.MANAGE_SETTINGS },
  { href: "/back-office/achievements", label: "Achievements", permission: Permission.MANAGE_SETTINGS },
  { href: "/back-office/reservations", label: "Reservations", permission: Permission.MANAGE_RESERVATIONS },
  { href: "/back-office/promotions", label: "Promotions", permission: Permission.MANAGE_PROMOTIONS },
  { href: "/back-office/staff", label: "Staff & Roles", permission: Permission.MANAGE_STAFF },
  { href: "/back-office/reports", label: "Reports", permission: Permission.VIEW_REPORTS },
  { href: "/back-office/settings", label: "Settings", permission: Permission.MANAGE_SETTINGS },
];

export function BackOfficeShell({
  staff,
  children,
}: {
  staff: CurrentStaff;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col bg-brand-950 text-white/90 md:flex">
        <div className="px-5 py-6">
          <p className="text-xs uppercase tracking-[0.3em] text-teal-400">
            Wanderer&apos;s Rest
          </p>
          <p className="mt-1 text-lg font-semibold text-white">
            Back Office
          </p>
          {(canAccessCashier(staff) || canAccessStaffMobile(staff)) && (
            <div className="mt-3 flex gap-3 text-xs">
              {canAccessCashier(staff) && (
                <Link href="/cashier" className="text-teal-400 hover:text-teal-300">
                  Cashier POS →
                </Link>
              )}
              {canAccessStaffMobile(staff) && (
                <Link href="/staff" className="text-teal-400 hover:text-teal-300">
                  Staff Mobile →
                </Link>
              )}
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV_ITEMS.filter((item) => !item.permission || can(staff, item.permission)).map(
            (item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-lg px-3 py-2.5 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <div className="border-t border-white/10 px-3 py-4">
          <p className="px-3 text-xs text-white/50">
            {staff.displayName ?? staff.name} · {staff.roleName}
          </p>
          <form action={logoutAction}>
            <button className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-white/60 hover:bg-white/10 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
          <span className="text-sm font-semibold">
            Back Office
          </span>
          <Link href="/" className="text-sm text-teal-600">
            Menu
          </Link>
        </header>
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
