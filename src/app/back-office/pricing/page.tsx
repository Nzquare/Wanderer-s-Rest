import { PricingTypesManager } from "@/components/back-office/pricing-types-manager";

export default function PricingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Pricing</h1>
        <p className="text-sm text-foreground-muted">
          Pricing types (§7) drive the rate the cashier picks when opening a
          table or reservation — Regular and Student out of the box, plus
          whatever else the café runs (D&amp;D nights, packages, private
          events). Only Active types show up at the till.
        </p>
      </div>
      <PricingTypesManager />
    </div>
  );
}
