import { ReportsView } from "@/components/back-office/reports-view";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
        <p className="text-sm text-foreground-muted">
          Sales, tables, payments, discounts, membership, games, and the
          audit trail — filterable by date.
        </p>
      </div>
      <ReportsView />
    </div>
  );
}
