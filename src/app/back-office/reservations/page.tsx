import { ReservationsManager } from "@/components/pos/reservations-manager";

export default function BackOfficeReservationsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Reservations</h1>
        <p className="text-sm text-foreground-muted">
          Same reservations Cashier sees — manage them from either place.
        </p>
      </div>
      <ReservationsManager basePath="/back-office" />
    </div>
  );
}
