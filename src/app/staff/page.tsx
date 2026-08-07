import { prisma } from "@/server/db";
import { TableStatusBadge } from "@/components/ui/status-badge";

export default async function StaffTablesPage() {
  const tables = await prisma.restaurantTable.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold text-foreground">Tables</h1>
      <div className="grid grid-cols-2 gap-3">
        {tables.map((table) => (
          <button
            key={table.id}
            className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 text-left shadow-sm active:scale-[0.98]"
          >
            <span className="text-2xl font-semibold text-foreground">
              {table.code}
            </span>
            <TableStatusBadge status={table.status} />
          </button>
        ))}
      </div>
    </div>
  );
}
