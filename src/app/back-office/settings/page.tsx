import { SettingsManager } from "@/components/back-office/settings-manager";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-foreground-muted">
          Every configurable business rule lives here — nothing is hard-coded.
        </p>
      </div>
      <SettingsManager />
    </div>
  );
}
