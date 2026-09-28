import { StaffManager } from "@/components/back-office/staff-manager";

export default function StaffPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Staff</h1>
        <p className="text-sm text-foreground-muted">
          Create logins, assign roles, reset PINs, and manage who can sign
          in.
        </p>
      </div>
      <StaffManager />
    </div>
  );
}
