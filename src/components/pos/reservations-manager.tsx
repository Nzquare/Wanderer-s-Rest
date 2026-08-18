"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc/client";
import type { AppRouter } from "@/server/trpc/routers/_app";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type UpcomingReservation = RouterOutputs["reservations"]["listUpcoming"][number];

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-status-warning/15 text-status-warning",
  CONFIRMED: "bg-status-active/15 text-status-active",
  CHECKED_IN: "bg-status-success/15 text-status-success",
  COMPLETED: "bg-status-neutral/15 text-status-neutral",
  CANCELLED: "bg-status-danger/15 text-status-danger",
  NO_SHOW: "bg-status-danger/15 text-status-danger",
};

function NewReservationForm() {
  const utils = trpc.useUtils();
  const { data: types } = trpc.reservations.listTypes.useQuery();
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("18:00");
  const [partySize, setPartySize] = useState("4");
  const [typeId, setTypeId] = useState("");
  const [notes, setNotes] = useState("");

  const create = trpc.reservations.create.useMutation({
    onSuccess: async () => {
      setCustomerName("");
      setPhone("");
      setNotes("");
      await utils.reservations.listUpcoming.invalidate();
      await utils.reservations.list.invalidate();
    },
  });

  const effectiveTypeId = typeId || types?.[0]?.id || "";
  const selectedType = types?.find((t) => t.id === effectiveTypeId);

  return (
    <Card className="space-y-3">
      <p className="font-medium text-foreground">New reservation</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <label className="text-xs text-foreground-muted">Customer name</label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          />
        </div>
        <div className="w-36">
          <label className="text-xs text-foreground-muted">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          />
        </div>
        <div className="w-36">
          <label className="text-xs text-foreground-muted">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          />
        </div>
        <div className="w-28">
          <label className="text-xs text-foreground-muted">Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          />
        </div>
        <div className="w-20">
          <label className="text-xs text-foreground-muted">Party</label>
          <input
            type="number"
            value={partySize}
            onChange={(e) => setPartySize(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          />
        </div>
        <div className="w-40">
          <label className="text-xs text-foreground-muted">Type</label>
          <select
            value={effectiveTypeId}
            onChange={(e) => setTypeId(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          >
            {types?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nameEn}
              </option>
            ))}
          </select>
        </div>
        <div className="w-48 flex-1">
          <label className="text-xs text-foreground-muted">Notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          />
        </div>
      </div>
      {selectedType?.requiresDeposit && (
        <p className="text-xs text-status-warning">
          {selectedType.nameEn} requires a ฿{Number(selectedType.defaultDepositAmount ?? 0)} deposit
          — it&apos;ll be recorded as paid.
        </p>
      )}
      {create.error && <p className="text-xs text-status-danger">{create.error.message}</p>}
      <Button
        size="md"
        disabled={!customerName || !phone || !effectiveTypeId || create.isPending}
        onClick={() =>
          create.mutate({
            customerName,
            phone,
            date,
            startTime: new Date(`${date}T${time}:00`).toISOString(),
            partySize: Number(partySize),
            typeId: effectiveTypeId,
            notes: notes || undefined,
          })
        }
      >
        Create reservation
      </Button>
    </Card>
  );
}

function CheckInPicker({
  reservationId,
  onDone,
}: {
  reservationId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const { data: tables } = trpc.sessions.listTables.useQuery();
  const available = tables?.filter((t) => t.status === "AVAILABLE") ?? [];
  const checkIn = trpc.reservations.checkIn.useMutation({
    onSuccess: (data) => {
      onDone();
      router.push(`/cashier/tables/${data.tableId}`);
    },
  });

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-background p-3">
      <p className="text-xs text-foreground-muted">Assign a table to check in:</p>
      {checkIn.error && <p className="text-xs text-status-danger">{checkIn.error.message}</p>}
      <div className="flex flex-wrap gap-2">
        {available.map((t) => (
          <button
            key={t.id}
            onClick={() => checkIn.mutate({ reservationId, tableId: t.id })}
            disabled={checkIn.isPending}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:border-teal-500"
          >
            {t.code}
          </button>
        ))}
        {available.length === 0 && (
          <p className="text-sm text-foreground-muted">No available tables right now.</p>
        )}
      </div>
    </div>
  );
}

function ReservationRow({ reservation }: { reservation: UpcomingReservation }) {
  const utils = trpc.useUtils();
  const [checkingIn, setCheckingIn] = useState(false);
  const update = trpc.reservations.update.useMutation({
    onSuccess: () => {
      utils.reservations.listUpcoming.invalidate();
      utils.reservations.list.invalidate();
    },
  });

  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">
            {reservation.customerName} · {reservation.partySize} ppl
          </p>
          <p className="text-xs text-foreground-muted">
            {new Date(reservation.startTime).toLocaleString([], {
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {reservation.type.nameEn} · {reservation.phone}
            {reservation.member ? ` · ${reservation.member.adventurerName}` : ""}
          </p>
          {reservation.notes && (
            <p className="text-xs text-foreground-muted italic">{reservation.notes}</p>
          )}
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium",
            STATUS_STYLES[reservation.status],
          )}
        >
          {reservation.status.replace("_", " ")}
        </span>
      </div>
      {reservation.depositStatus !== "NOT_REQUIRED" && (
        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-medium",
              reservation.depositStatus === "PAID"
                ? "bg-status-success/15 text-status-success"
                : reservation.depositStatus === "PENDING"
                  ? "bg-status-warning/15 text-status-warning"
                  : "bg-status-neutral/15 text-status-neutral",
            )}
          >
            Deposit {reservation.depositStatus.toLowerCase()}
            {reservation.depositAmount ? ` · ฿${Number(reservation.depositAmount)}` : ""}
          </span>
          {reservation.depositStatus === "PENDING" && (
            <button
              onClick={() => update.mutate({ id: reservation.id, depositStatus: "PAID" })}
              disabled={update.isPending}
              className="text-teal-600 underline"
            >
              Mark collected
            </button>
          )}
          {reservation.depositStatus === "PAID" && (
            <button
              onClick={() => update.mutate({ id: reservation.id, depositStatus: "PENDING" })}
              disabled={update.isPending}
              className="text-foreground-muted underline"
            >
              Mark unpaid
            </button>
          )}
        </div>
      )}
      {(reservation.status === "PENDING" || reservation.status === "CONFIRMED") && (
        <div className="flex gap-2">
          <Button size="md" onClick={() => setCheckingIn((v) => !v)}>
            Check In
          </Button>
          <Button
            size="md"
            variant="outline"
            onClick={() => update.mutate({ id: reservation.id, status: "NO_SHOW" })}
          >
            No Show
          </Button>
          <Button
            size="md"
            variant="outline"
            onClick={() => update.mutate({ id: reservation.id, status: "CANCELLED" })}
          >
            Cancel
          </Button>
        </div>
      )}
      {checkingIn && (
        <CheckInPicker reservationId={reservation.id} onDone={() => setCheckingIn(false)} />
      )}
    </Card>
  );
}

export function ReservationsManager() {
  const { data: upcoming, isLoading } = trpc.reservations.listUpcoming.useQuery();

  return (
    <div className="space-y-4">
      <NewReservationForm />
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground-muted">
          Upcoming ({upcoming?.length ?? 0})
        </p>
        {isLoading && <p className="text-sm text-foreground-muted">Loading…</p>}
        {upcoming?.length === 0 && (
          <p className="text-sm text-foreground-muted">No upcoming reservations.</p>
        )}
        {upcoming?.map((r) => (
          <ReservationRow key={r.id} reservation={r} />
        ))}
      </div>
    </div>
  );
}
