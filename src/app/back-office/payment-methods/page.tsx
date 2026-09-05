import { PaymentMethodsManager } from "@/components/back-office/payment-methods-manager";

export default function PaymentMethodsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Payment Methods</h1>
        <p className="text-sm text-foreground-muted">
          What the cashier can pick at checkout — Cash, PromptPay / QR, Card and Other come
          built in, plus whatever else the café actually takes payment through (a delivery
          platform like Line Man or Grab, a bank transfer, ...). Only Active methods show up
          at the till.
        </p>
      </div>
      <PaymentMethodsManager />
    </div>
  );
}
