import { prisma } from "@/server/db";
import { Card } from "@/components/ui/card";

export default async function BackOfficeDashboard() {
  const [tables, menuItems, staff, members] = await Promise.all([
    prisma.restaurantTable.count(),
    prisma.menuItem.count(),
    prisma.staff.count({ where: { status: "ACTIVE" } }),
    prisma.member.count(),
  ]);

  const stats = [
    { label: "Tables", value: tables },
    { label: "Menu items", value: menuItems },
    { label: "Active staff", value: staff },
    { label: "Members", value: members },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-foreground-muted">
          Wanderer&apos;s Rest — Back Office
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <p className="text-3xl font-semibold text-brand-700 dark:text-teal-400">
              {stat.value}
            </p>
            <p className="text-sm text-foreground-muted">{stat.label}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
