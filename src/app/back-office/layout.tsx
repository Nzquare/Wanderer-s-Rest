import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/auth/current-user";
import { canAccessBackOffice } from "@/server/rbac/can";
import { getSettings } from "@/server/settings/service";
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
  const cafe = await getSettings("cafe");

  return (
    <BackOfficeShell staff={staff} cafe={cafe}>
      {children}
    </BackOfficeShell>
  );
}
