import { AdventurerProfile } from "@/components/back-office/adventurer-profile";

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdventurerProfile memberId={id} />;
}
