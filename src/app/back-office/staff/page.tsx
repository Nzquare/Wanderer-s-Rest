import { StaffRolesManager } from "@/components/back-office/staff-roles-manager";

export default function StaffPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Staff & Roles</h1>
        <p className="text-sm text-foreground-muted">
          Create logins, assign roles, and configure exactly what each role
          can do.
        </p>
      </div>
      <StaffRolesManager />
    </div>
  );
}
