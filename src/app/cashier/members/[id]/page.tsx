import Link from "next/link";
import { AdventurerProfile } from "@/components/back-office/adventurer-profile";

export default async function CashierMemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-3">
      <Link href="/cashier/members" className="text-sm text-teal-600">
        ← All members
      </Link>
      <AdventurerProfile memberId={id} />
    </div>
  );
}
