import { prisma } from "@/server/db";
import { Card } from "@/components/ui/card";
import { TableStatusBadge } from "@/components/ui/status-badge";

export default async function CashierTablesPage() {
  const tables = await prisma.restaurantTable.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Tables</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tables.map((table) => (
          <Card key={table.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-foreground">
                {table.code}
              </span>
              <TableStatusBadge status={table.status} />
            </div>
            <p className="text-sm text-foreground-muted">
              {table.capacity} seats · {table.area ?? "—"}
            </p>
          </Card>
        ))}
      </div>
      <p className="text-sm text-foreground-muted">
        Timers, orders, and checkout land in the next build pass.
      </p>
    </div>
  );
}
