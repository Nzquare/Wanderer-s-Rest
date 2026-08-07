import { notFound } from "next/navigation";
import { prisma } from "@/server/db";

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
    <main className="min-h-screen bg-gradient-to-b from-brand-950 via-brand-900 to-brand-800 px-4 py-10 text-white">
      <div className="mx-auto max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-teal-400">
          Wanderer&apos;s Rest
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Welcome to {table.name}</h1>

        {!table.qrEnabled ? (
          <p className="mt-8 rounded-2xl bg-white/10 p-6 text-white/80">
            Ordering from this table isn&apos;t available right now — please
            flag down a Tavern Keeper.
          </p>
        ) : (
          <p className="mt-8 rounded-2xl bg-white/10 p-6 text-white/80">
            The adventurer&apos;s menu is being prepared. Check back soon, or
            ask staff to take your order.
          </p>
        )}
      </div>
    </main>
  );
}
