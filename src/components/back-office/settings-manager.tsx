"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/routers/_app";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fileToResizedDataUrl } from "@/lib/image-to-data-url";

type AllSettings = inferRouterOutputs<AppRouter>["settings"]["getAll"];
type CafeSettings = AllSettings["cafe"];

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

/**
 * Café logo upload (§Logo upload) — no file-storage service is set up for
 * this project, so there's nowhere to POST a file to. Instead the picked
 * image is resized in the browser and turned into a data URI
 * (fileToResizedDataUrl), stored as the same plain `logoUrl` string every
 * consumer already reads via `<img src>` — works immediately, no new
 * infrastructure, no upload endpoint.
 */
function LogoField({
  cafe,
  setCafe,
}: {
  cafe: CafeSettings;
  setCafe: (next: CafeSettings) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setCafe({ ...cafe, logoUrl: dataUrl });
    } catch {
      setError("Couldn't read that image — try a different file.");
    }
  }

  return (
    <div>
      <label className="text-xs text-foreground-muted">Logo</label>
      <div className="mt-1 flex items-center gap-3">
        {cafe.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cafe.logoUrl}
            alt="Logo preview"
            className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover"
          />
        )}
        <div className="space-y-1">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="text-sm"
          />
          {cafe.logoUrl && (
            <button
              type="button"
              onClick={() => setCafe({ ...cafe, logoUrl: null })}
              className="block text-xs text-status-danger underline"
            >
              Remove logo
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-status-danger">{error}</p>}
      <p className="mt-1 text-xs text-foreground-muted">
        Shown on printed receipts and the customer-facing ordering/member
        pages. Leave unset to show the café name as text instead. Uploading
        a new file replaces this immediately (don&apos;t forget Save below).
      </p>
    </div>
  );
}

export function SettingsManager() {
  const { data, isLoading, error } = trpc.settings.getAll.useQuery();

  // A FORBIDDEN here (no MANAGE_SETTINGS) used to leave isLoading false and
  // data undefined with nothing distinguishing it from a slow load — this
  // page just showed "Loading settings…" forever, with no error, no matter
  // how long the visitor waited (§Back Office permission-error visibility).
  if (error) {
    return <p className="text-sm text-status-danger">{error.message}</p>;
  }
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
  const [membership, setMembership] = useState(data.membership);
  const [checkout, setCheckout] = useState(data.checkout);
  const [notifications, setNotifications] = useState(data.notifications);

  const invalidate = () => utils.settings.getAll.invalidate();
  const saveCafe = trpc.settings.updateCafe.useMutation({ onSuccess: invalidate });
  const saveMembership = trpc.settings.updateMembership.useMutation({
    onSuccess: invalidate,
  });
  const saveCheckout = trpc.settings.updateCheckout.useMutation({
    onSuccess: invalidate,
  });
  const saveNotifications = trpc.settings.updateNotifications.useMutation({
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
        <LogoField cafe={cafe} setCafe={setCafe} />
        <Button size="md" disabled={saveCafe.isPending} onClick={() => saveCafe.mutate(cafe)}>
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
    </div>
  );
}
