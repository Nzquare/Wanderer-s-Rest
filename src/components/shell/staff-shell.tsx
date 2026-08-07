import Link from "next/link";
import { logoutAction } from "@/server/auth/actions";
import type { CurrentStaff } from "@/server/auth/current-user";
import { canAccessBackOffice, canAccessCashier } from "@/server/rbac/can";

// Staff Mobile is the "extremely simple" operational tool (§15). One row of
// big icons, nothing else — a Tavern Keeper should never need to think
// about navigation here.
export function StaffShell({
  staff,
  children,
}: {
  staff: CurrentStaff;
  children: React.ReactNode;
}) {
  const showSwitcher = canAccessCashier(staff) || canAccessBackOffice(staff);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between bg-brand-950 px-4 py-3 text-white">
        <Link href="/staff" className="text-sm font-semibold text-teal-400">
          Wanderer&apos;s Rest
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
      <main className="flex-1 p-3">{children}</main>
    </div>
  );
}
