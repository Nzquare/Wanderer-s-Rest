import { TableGrid } from "@/components/pos/table-grid";

export default function CashierTablesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Tables</h1>
      <TableGrid basePath="/cashier" />
    </div>
  );
}
