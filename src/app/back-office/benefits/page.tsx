import { BenefitsManager } from "@/components/back-office/benefits-manager";

export default function BenefitsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Benefits</h1>
        <p className="text-sm text-foreground-muted">
          Every reward a member has earned from an achievement (§Achievement
          Benefits) — free items, discounts, free playtime, and so on —
          across the whole membership base. Mark one redeemed once it&apos;s
          actually been given out; this is also available on each member&apos;s
          own profile.
        </p>
      </div>
      <BenefitsManager />
    </div>
  );
}
