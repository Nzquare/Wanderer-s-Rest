import { MembersList } from "@/components/back-office/members-list";

export default function MembersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Members</h1>
        <p className="text-sm text-foreground-muted">
          Search the guild roster, or open a profile to adjust EXP, class, or notes.
        </p>
      </div>
      <MembersList />
    </div>
  );
}
