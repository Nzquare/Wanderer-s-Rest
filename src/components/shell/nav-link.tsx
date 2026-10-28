"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Highlights itself when the current route matches `href` — shared by
 * every shell's nav (Cashier, Back Office, Staff Mobile, and the Back
 * Office mobile drawer) so a multi-tab bar always shows which section
 * you're actually in, instead of every tab looking identical regardless
 * of where you are (§highlight the selected tab).
 *
 * Defaults to matching an exact path or any sub-path of it
 * (`/back-office/members/abc123` highlights the Members tab at
 * `/back-office/members`). Pass `exact` for a bare root link like
 * `/cashier` or `/back-office` — as a plain prefix it would otherwise
 * also "match" literally every other route under it, since they all
 * start with that same string, lighting up as active no matter which
 * tab you're really on. `activeMatchPrefix` then adds back just the one
 * sub-path that conceptually belongs to that root tab but isn't hosted
 * under its own href (e.g. table detail pages live at
 * "/cashier/tables/[id]", not under plain "/cashier/[id]", even though
 * "Tables" is the tab at bare "/cashier").
 */
export function NavLink({
  href,
  exact = false,
  activeMatchPrefix,
  className,
  activeClassName,
  inactiveClassName,
  onClick,
  children,
}: {
  href: string;
  exact?: boolean;
  activeMatchPrefix?: string;
  className?: string;
  activeClassName: string;
  inactiveClassName: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href || (activeMatchPrefix != null && pathname.startsWith(activeMatchPrefix))
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(className, active ? activeClassName : inactiveClassName)}
    >
      {children}
    </Link>
  );
}
