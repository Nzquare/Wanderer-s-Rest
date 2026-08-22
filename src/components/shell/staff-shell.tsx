import Link from "next/link";
import { logoutAction } from "@/server/auth/actions";
import type { CurrentStaff } from "@/server/auth/current-user";
import type { CafeSettings } from "@/server/settings/schema";
import { canAccessBackOffice, canAccessCashier } from "@/server/rbac/can";
import { pickLogo } from "@/lib/pick-logo";

const NAV_ITEMS = [
  { href: "/staff", label: "Tables" },
  { href: "/staff/quick-sale", label: "Quick Sale" },
];

// Staff Mobile is the "extremely simple" operational tool (§15). One row of
// big icons, nothing else — a Tavern Keeper should never need to think
// about navigation here. Quick Sale (§Quick Sale) earns the one extra tab
// since walk-in/delivery tables aren't reachable from the Tables floor
// plan at all.
export function StaffShell({
  staff,
  cafe,
  children,
}: {
  staff: CurrentStaff;
  cafe: CafeSettings;
  children: React.ReactNode;
}) {
  const showSwitcher = canAccessCashier(staff) || canAccessBackOffice(staff);
  const logo = pickLogo(cafe, "dark");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between bg-brand-950 px-4 py-3 text-white">
        <Link href="/staff" className="flex items-center gap-2 text-sm font-semibold text-teal-400">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-12 w-12 object-contain" />
          )}
          {cafe.nameEn}
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {showSwitcher && (
            <Link href="/" className="text-white/60 hover:text-white">
              Switch app
            </Link>
          )}
          <form action={logoutAction}>
            <button className="text-white/60 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <nav className="flex gap-1 border-b border-border bg-surface px-2 py-2">
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
      <main className="flex-1 p-3">{children}</main>
    </div>
  );
}
