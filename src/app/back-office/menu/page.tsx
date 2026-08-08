import { MenuManager } from "@/components/back-office/menu-manager";

export default function BackOfficeMenuPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Menu</h1>
        <p className="text-sm text-foreground-muted">
          Categories, items, and modifiers — changes show up instantly on
          Cashier, Staff Mobile, and (soon) Customer QR ordering.
        </p>
      </div>
      <MenuManager />
    </div>
  );
}
