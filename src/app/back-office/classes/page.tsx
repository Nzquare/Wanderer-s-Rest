import { ClassesManager } from "@/components/back-office/classes-manager";

export default function ClassesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Classes</h1>
        <p className="text-sm text-foreground-muted">
          The adventurer classes members can pick from (§29) — Fighter,
          Scholar, and the like out of the box, plus whatever the café
          wants. Set a class on a member from their own profile.
        </p>
      </div>
      <ClassesManager />
    </div>
  );
}
