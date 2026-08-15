import { CashierMembersList } from "@/components/pos/cashier-members-list";

export default function CashierMembersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Members</h1>
      <CashierMembersList />
    </div>
  );
}
