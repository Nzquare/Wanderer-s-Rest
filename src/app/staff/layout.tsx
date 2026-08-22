import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/auth/current-user";
import { getSettings } from "@/server/settings/service";
import { StaffShell } from "@/components/shell/staff-shell";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  const cafe = await getSettings("cafe");

  return (
    <StaffShell staff={staff} cafe={cafe}>
      {children}
    </StaffShell>
  );
}
