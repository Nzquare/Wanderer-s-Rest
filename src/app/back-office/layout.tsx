import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/auth/current-user";
import { canAccessBackOffice } from "@/server/rbac/can";
import { BackOfficeShell } from "@/components/shell/back-office-shell";
import { Unauthorized } from "@/components/unauthorized";

export default async function BackOfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  if (!canAccessBackOffice(staff)) return <Unauthorized />;

  return <BackOfficeShell staff={staff}>{children}</BackOfficeShell>;
}
