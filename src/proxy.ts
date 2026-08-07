import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "@/server/auth/session";

const PROTECTED_PREFIXES = ["/back-office", "/cashier", "/staff"];

// Proxy (formerly "middleware") only checks that a validly signed session
// cookie exists (identity) and stays out of the DB — fine-grained permission
// checks (which of Back Office / Cashier a staff member may use) happen in
// each route group's layout via getCurrentStaff(), which is request-cached.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get("wr_session")?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/back-office/:path*", "/cashier/:path*", "/staff/:path*"],
};
