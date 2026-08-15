import Link from "next/link";
import { logoutAction } from "@/server/auth/actions";
import type { CurrentStaff } from "@/server/auth/current-user";
import { canAccessCashier, canAccessStaffMobile } from "@/server/rbac/can";

const NAV_ITEMS = [
  { href: "/back-office", label: "Dashboard" },
  { href: "/back-office/tables", label: "Tables" },
  { href: "/back-office/pricing", label: "Pricing" },
  { href: "/back-office/menu", label: "Menu" },
  { href: "/back-office/games", label: "Game Library" },
  { href: "/back-office/members", label: "Members" },
  { href: "/back-office/classes", label: "Classes" },
  { href: "/back-office/ranks", label: "Ranks" },
  { href: "/back-office/achievements", label: "Achievements" },
  { href: "/back-office/reservations", label: "Reservations" },
  { href: "/back-office/promotions", label: "Promotions" },
  { href: "/back-office/staff", label: "Staff & Roles" },
  { href: "/back-office/reports", label: "Reports" },
  { href: "/back-office/settings", label: "Settings" },
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
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2.5 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
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
