"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/routers/_app";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type AllSettings = inferRouterOutputs<AppRouter>["settings"]["getAll"];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-foreground-muted">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm";

export function SettingsManager() {
  const { data, isLoading } = trpc.settings.getAll.useQuery();

  if (isLoading || !data) {
    return <p className="text-sm text-foreground-muted">Loading settings…</p>;
  }

  // Keyed on nothing else changing shape — a fresh mount per successful
  // load, so local edit state is always seeded straight from real data
  // with no separate effect needed to keep them in sync.
  return <SettingsForm data={data} />;
}

function SettingsForm({ data }: { data: AllSettings }) {
  const utils = trpc.useUtils();

  const [cafe, setCafe] = useState(data.cafe);
  const [pricing, setPricing] = useState(data.tablePricingDefaults);
  const [membership, setMembership] = useState(data.membership);
  const [checkout, setCheckout] = useState(data.checkout);
  const [notifications, setNotifications] = useState(data.notifications);
  const [reservations, setReservations] = useState(data.reservations);

  const invalidate = () => utils.settings.getAll.invalidate();
  const saveCafe = trpc.settings.updateCafe.useMutation({ onSuccess: invalidate });
  const savePricing = trpc.settings.updateTablePricingDefaults.useMutation({
    onSuccess: invalidate,
  });
  const saveMembership = trpc.settings.updateMembership.useMutation({
    onSuccess: invalidate,
  });
  const saveCheckout = trpc.settings.updateCheckout.useMutation({
    onSuccess: invalidate,
  });
  const saveNotifications = trpc.settings.updateNotifications.useMutation({
    onSuccess: invalidate,
  });
  const saveReservations = trpc.settings.updateReservations.useMutation({
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <p className="font-medium text-foreground">Café</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name (English)">
            <input
              className={inputCls}
              value={cafe.nameEn}
              onChange={(e) => setCafe({ ...cafe, nameEn: e.target.value })}
            />
          </Field>
          <Field label="Name (Thai)">
            <input
              className={inputCls}
              value={cafe.nameTh}
              onChange={(e) => setCafe({ ...cafe, nameTh: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputCls}
              value={cafe.phone}
              onChange={(e) => setCafe({ ...cafe, phone: e.target.value })}
            />
          </Field>
          <Field label="Opening hours">
            <input
              className={inputCls}
              value={cafe.openingHours}
              onChange={(e) => setCafe({ ...cafe, openingHours: e.target.value })}
            />
          </Field>
        </div>
        <Button size="md" disabled={saveCafe.isPending} onClick={() => saveCafe.mutate(cafe)}>
          Save
        </Button>
      </Card>

      <Card className="space-y-3">
        <p className="font-medium text-foreground">Table pricing defaults</p>
        <p className="text-xs text-foreground-muted">
          These prefill new pricing types — existing Regular/Student rates
          live in Back Office → Tables pricing types (coming soon); edit
          them directly in the database for now if needed.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Regular ฿/hr">
            <input
              type="number"
              className={inputCls}
              value={pricing.regularHourlyRate}
              onChange={(e) =>
                setPricing({ ...pricing, regularHourlyRate: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Student ฿/hr">
            <input
              type="number"
              className={inputCls}
              value={pricing.studentHourlyRate}
              onChange={(e) =>
                setPricing({ ...pricing, studentHourlyRate: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Grace period (min)">
            <input
              type="number"
              className={inputCls}
              value={pricing.gracePeriodMinutes}
              onChange={(e) =>
                setPricing({ ...pricing, gracePeriodMinutes: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Daily cap ฿/person">
            <input
              type="number"
              className={inputCls}
              value={pricing.dailyCapPerPerson}
              onChange={(e) =>
                setPricing({ ...pricing, dailyCapPerPerson: Number(e.target.value) })
              }
            />
          </Field>
        </div>
        <Button
          size="md"
          disabled={savePricing.isPending}
          onClick={() => savePricing.mutate(pricing)}
        >
          Save
        </Button>
      </Card>

      <Card className="space-y-3">
        <p className="font-medium text-foreground">Membership</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="฿ per EXP">
            <input
              type="number"
              className={inputCls}
              value={membership.bahtPerExp}
              onChange={(e) =>
                setMembership({ ...membership, bahtPerExp: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="EXP per level">
            <input
              type="number"
              className={inputCls}
              value={membership.expPerLevel}
              onChange={(e) =>
                setMembership({ ...membership, expPerLevel: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Levels per rank">
            <input
              type="number"
              className={inputCls}
              value={membership.levelsPerRank}
              onChange={(e) =>
                setMembership({ ...membership, levelsPerRank: Number(e.target.value) })
              }
            />
          </Field>
        </div>
        <Button
          size="md"
          disabled={saveMembership.isPending}
          onClick={() => saveMembership.mutate(membership)}
        >
          Save
        </Button>
      </Card>

      <Card className="space-y-3">
        <p className="font-medium text-foreground">Checkout</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checkout.taxEnabled}
              onChange={(e) => setCheckout({ ...checkout, taxEnabled: e.target.checked })}
            />
            Tax enabled
          </label>
          <Field label="Tax %">
            <input
              type="number"
              className={inputCls}
              value={checkout.taxPercent}
              onChange={(e) =>
                setCheckout({ ...checkout, taxPercent: Number(e.target.value) })
              }
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checkout.serviceChargeEnabled}
              onChange={(e) =>
                setCheckout({ ...checkout, serviceChargeEnabled: e.target.checked })
              }
            />
            Service charge enabled
          </label>
          <Field label="Service %">
            <input
              type="number"
              className={inputCls}
              value={checkout.serviceChargePercent}
              onChange={(e) =>
                setCheckout({ ...checkout, serviceChargePercent: Number(e.target.value) })
              }
            />
          </Field>
        </div>
        <Field label="Receipt footer (English)">
          <input
            className={inputCls}
            value={checkout.receiptFooterEn}
            onChange={(e) => setCheckout({ ...checkout, receiptFooterEn: e.target.value })}
          />
        </Field>
        <div className="flex flex-wrap gap-4">
          <Field label="Receipt printer width">
            <select
              className={inputCls}
              value={checkout.printerWidthMm}
              onChange={(e) =>
                setCheckout({
                  ...checkout,
                  printerWidthMm: Number(e.target.value) as 58 | 80,
                })
              }
            >
              <option value={58}>58mm</option>
              <option value={80}>80mm</option>
            </select>
          </Field>
          <Field label="PromptPay ID (phone, national/tax ID, or e-Wallet)">
            <input
              className={inputCls}
              placeholder="e.g. 0812345678"
              value={checkout.promptpayId}
              onChange={(e) => setCheckout({ ...checkout, promptpayId: e.target.value })}
            />
          </Field>
        </div>
        <p className="text-xs text-foreground-muted">
          Set a PromptPay ID to show a real scan-to-pay QR code at checkout
          whenever PromptPay is selected as the payment method.
        </p>
        <Button
          size="md"
          disabled={saveCheckout.isPending}
          onClick={() => saveCheckout.mutate(checkout)}
        >
          Save
        </Button>
      </Card>

      <Card className="space-y-3">
        <p className="font-medium text-foreground">Notifications</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifications.cashierSoundEnabled}
              onChange={(e) =>
                setNotifications({ ...notifications, cashierSoundEnabled: e.target.checked })
              }
            />
            Cashier sound on
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifications.notifyOnCustomerOrder}
              onChange={(e) =>
                setNotifications({
                  ...notifications,
                  notifyOnCustomerOrder: e.target.checked,
                })
              }
            />
            Notify on customer QR order
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifications.notifyOnStaffOrder}
              onChange={(e) =>
                setNotifications({ ...notifications, notifyOnStaffOrder: e.target.checked })
              }
            />
            Notify on staff order
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifications.autoPrintKitchenTicket}
              onChange={(e) =>
                setNotifications({
                  ...notifications,
                  autoPrintKitchenTicket: e.target.checked,
                })
              }
            />
            Auto-print kitchen ticket
          </label>
        </div>
        <p className="text-xs text-foreground-muted">
          Auto-print opens the print dialog for a kitchen ticket the moment a
          new customer/staff order comes in (uses the same printer as
          receipts — Checkout → printer width above). Every order also gets
          its own manual print button in the order alert, whether or not
          this is on.
        </p>
        <Button
          size="md"
          disabled={saveNotifications.isPending}
          onClick={() => saveNotifications.mutate(notifications)}
        >
          Save
        </Button>
      </Card>

      <Card className="space-y-3">
        <p className="font-medium text-foreground">Reservations</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reservations.casualRequiresDeposit}
              onChange={(e) =>
                setReservations({
                  ...reservations,
                  casualRequiresDeposit: e.target.checked,
                })
              }
            />
            Casual bookings require deposit
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reservations.specialRequiresDeposit}
              onChange={(e) =>
                setReservations({
                  ...reservations,
                  specialRequiresDeposit: e.target.checked,
                })
              }
            />
            D&D/special bookings require deposit
          </label>
          <Field label="Default deposit (฿)">
            <input
              type="number"
              className={inputCls}
              value={reservations.specialDefaultDepositAmount}
              onChange={(e) =>
                setReservations({
                  ...reservations,
                  specialDefaultDepositAmount: Number(e.target.value),
                })
              }
            />
          </Field>
        </div>
        <Button
          size="md"
          disabled={saveReservations.isPending}
          onClick={() => saveReservations.mutate(reservations)}
        >
          Save
        </Button>
      </Card>
    </div>
  );
}
