import { TablesManager } from "@/components/back-office/tables-manager";

export default function TablesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Tables</h1>
        <p className="text-sm text-foreground-muted">
          Add tables, toggle QR ordering, and print each table&apos;s QR code.
        </p>
      </div>
      <TablesManager />
    </div>
  );
}
