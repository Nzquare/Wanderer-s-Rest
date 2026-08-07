import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/auth/current-user";
import { StaffShell } from "@/components/shell/staff-shell";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  return <StaffShell staff={staff}>{children}</StaffShell>;
}
