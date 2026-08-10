import { PromotionsManager } from "@/components/back-office/promotions-manager";

export default function PromotionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Promotions</h1>
        <p className="text-sm text-foreground-muted">
          Scheduled discounts (§19) — cashiers see anything eligible right on
          the checkout screen and apply it with one tap. Manual discounts at
          checkout still work for one-off cases.
        </p>
      </div>
      <PromotionsManager />
    </div>
  );
}
