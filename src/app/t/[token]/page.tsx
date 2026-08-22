import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings/service";
import { CustomerOrderApp } from "@/components/customer/customer-order-app";

export default async function CustomerTablePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [table, cafe] = await Promise.all([
    prisma.restaurantTable.findUnique({ where: { qrToken: token } }),
    getSettings("cafe"),
  ]);

  if (!table || !table.active) notFound();

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-950 via-brand-900 to-brand-800 px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-4 text-center">
          {cafe.logoUrl && (
            // Café's own logo (Back Office → Settings → Café) — falls back
            // to the plain text wordmark below if not set (§Receipt/website
            // logo). eslint-disable: staff-set URL, not a local asset Next
            // Image can validate ahead of time.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cafe.logoUrl} alt="" className="mx-auto mb-1 h-40 w-40 object-contain" />
          )}
          <p className="text-xs uppercase tracking-[0.35em] text-teal-400">{cafe.nameEn}</p>
          <h1 className="mt-1 text-2xl font-semibold">{table.name}</h1>
        </div>
        <CustomerOrderApp qrToken={token} />
        <p className="mt-6 text-center text-xs text-white/50">
          Already a member?{" "}
          <Link href="/member" className="text-teal-400 underline">
            Check your profile
          </Link>
        </p>
      </div>
    </main>
  );
}
