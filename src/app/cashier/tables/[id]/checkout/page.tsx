import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { CheckoutClient } from "@/components/pos/checkout-client";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await prisma.tableSession.findFirst({
    where: {
      tableId: id,
      status: { in: ["OPEN", "PAUSED", "READY_FOR_CHECKOUT", "CHECKOUT_IN_PROGRESS"] },
    },
  });
  if (!session) redirect(`/cashier/tables/${id}`);

  return <CheckoutClient sessionId={session.id} tableId={id} />;
}
