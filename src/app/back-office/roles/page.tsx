import { RolesManager } from "@/components/back-office/roles-manager";

export default function RolesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Roles & Permissions</h1>
        <p className="text-sm text-foreground-muted">
          Configure exactly what each role can do and which apps it can
          open.
        </p>
      </div>
      <RolesManager />
    </div>
  );
}
