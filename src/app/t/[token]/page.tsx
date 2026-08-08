import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { CustomerOrderApp } from "@/components/customer/customer-order-app";

export default async function CustomerTablePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const table = await prisma.restaurantTable.findUnique({
    where: { qrToken: token },
  });

  if (!table || !table.active) notFound();

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-950 via-brand-900 to-brand-800 px-4 py-8 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-teal-400">
            Wanderer&apos;s Rest
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{table.name}</h1>
        </div>
        <CustomerOrderApp qrToken={token} />
      </div>
    </main>
  );
}
