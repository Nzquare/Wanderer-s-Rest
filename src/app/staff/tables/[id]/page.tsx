import { TableDetail } from "@/components/pos/table-detail";

export default async function StaffTableDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TableDetail tableId={id} basePath="/staff" />;
}
