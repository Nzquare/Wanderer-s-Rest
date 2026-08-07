import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/auth/current-user";
import { canAccessCashier } from "@/server/rbac/can";
import { CashierShell } from "@/components/shell/cashier-shell";
import { Unauthorized } from "@/components/unauthorized";

export default async function CashierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  if (!canAccessCashier(staff)) return <Unauthorized />;

  return <CashierShell staff={staff}>{children}</CashierShell>;
}
