import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentStaff } from "@/server/auth/current-user";
import { canAccessBackOffice, canAccessCashier } from "@/server/rbac/can";
import { logoutAction } from "@/server/auth/actions";

// A logged-in staff member lands here once. If only one app is reachable
// with their permissions, skip straight to it — the chooser only appears
// for staff (Owner/Manager, typically) who can actually use more than one.
export default async function Home() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const apps = [
    {
      href: "/back-office",
      label: "Back Office",
      description: "Settings, menu, staff, reports",
      available: canAccessBackOffice(staff),
    },
    {
      href: "/cashier",
      label: "Cashier POS",
      description: "Tables, orders, checkout, shifts",
      available: canAccessCashier(staff),
    },
    {
      href: "/staff",
      label: "Staff Mobile",
      description: "Tables, orders, timers, games",
      available: true,
    },
  ];

  const reachable = apps.filter((a) => a.available);
  if (reachable.length === 1) redirect(reachable[0].href);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-brand-950 px-4 py-12">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-teal-400">
          Wanderer&apos;s Rest
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          Welcome back, {staff.displayName ?? staff.name}
        </h1>
      </div>

      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-3">
        {reachable.map((app) => (
          <Link
            key={app.href}
            href={app.href}
            className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-surface p-6 text-foreground shadow-xl transition-transform hover:scale-[1.02]"
          >
            <span className="text-lg font-semibold">{app.label}</span>
            <span className="text-sm text-foreground-muted">
              {app.description}
            </span>
          </Link>
        ))}
      </div>

      <form action={logoutAction}>
        <button className="text-sm text-white/50 hover:text-white/80">
          Sign out
        </button>
      </form>
    </main>
  );
}
