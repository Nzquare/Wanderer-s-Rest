import { TableGrid } from "@/components/pos/table-grid";
import { UpcomingReservationsWidget } from "@/components/pos/upcoming-reservations-widget";

export default function CashierTablesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Tables</h1>
      <UpcomingReservationsWidget />
      <TableGrid basePath="/cashier" />
    </div>
  );
}
