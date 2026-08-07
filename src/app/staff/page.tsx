import { TableGrid } from "@/components/pos/table-grid";

export default function StaffTablesPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold text-foreground">Tables</h1>
      <TableGrid basePath="/staff" />
    </div>
  );
}
