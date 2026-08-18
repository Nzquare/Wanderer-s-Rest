import { ReservationsManager } from "@/components/pos/reservations-manager";

export default function CashierReservationsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Reservations</h1>
      <ReservationsManager basePath="/cashier" />
    </div>
  );
}
