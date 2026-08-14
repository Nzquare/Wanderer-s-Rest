"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleButton } from "@/components/ui/toggle-button";
import { Modal } from "@/components/ui/modal";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MODEL_LABELS: Record<string, string> = {
  HOURLY: "Hourly",
  FIXED: "Flat / all-day",
  PACKAGE: "Package",
};

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-teal-500"
    />
  );
}

type PricingType = {
  id: string;
  code: string;
  name: string;
  model: "HOURLY" | "FIXED" | "PACKAGE";
  hourlyRate: number | null;
  fixedPrice: number | null;
  perPerson: boolean;
  dailyCap: number | null;
  gracePeriodMinutes: number;
  startTime: string | null;
  endTime: string | null;
  activeDays: number[] | null;
  activeFrom: string | Date | null;
  activeTo: string | Date | null;
  active: boolean;
  inUse: boolean;
};

function toDateInputValue(d: string | Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function summaryLine(t: PricingType): string {
  const rate =
    t.model === "HOURLY"
      ? `฿${t.hourlyRate ?? 0}/hr`
      : `฿${t.fixedPrice ?? 0} ${t.model === "PACKAGE" ? "package" : "flat"}`;
  return `${rate}${t.perPerson ? " · per person" : " · per table"}${t.dailyCap ? ` · capped ฿${t.dailyCap}` : ""}`;
}

/**
 * Full edit form, in a popup rather than inline — same reasoning as
 * PromotionDetailsModal: a long list with every field expanded on every
 * row is unusable, so the list shows a compact summary and this modal is
 * where the fine-tuning (window, days, delete) happens.
 */
function PricingTypeDetailsModal({
  pricingType: t,
  onClose,
}: {
  pricingType: PricingType;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const invalidate = () =>
    Promise.all([utils.pricingTypes.listAll.invalidate(), utils.pricingTypes.list.invalidate()]);
  const update = trpc.pricingTypes.update.useMutation({ onSuccess: invalidate });
  const remove = trpc.pricingTypes.remove.useMutation({
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const days = new Set(t.activeDays ?? []);
  function toggleDay(d: number) {
    const next = new Set(days);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    update.mutate({ id: t.id, activeDays: Array.from(next) });
  }

  return (
    <Modal open onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <input
              defaultValue={t.name}
              onBlur={(e) => e.target.value !== t.name && update.mutate({ id: t.id, name: e.target.value })}
              className="rounded border border-transparent bg-transparent text-lg font-medium text-foreground hover:border-border focus:border-teal-500 focus:outline-none"
            />
            <p className="text-sm text-foreground-muted">{summaryLine(t)}</p>
          </div>
          <ToggleButton
            on={t.active}
            onLabel="Active"
            offLabel="Inactive"
            onClick={() => update.mutate({ id: t.id, active: !t.active })}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-foreground-muted">Code</label>
            <TextInput
              defaultValue={t.code}
              onBlur={(e) => e.target.value && e.target.value !== t.code && update.mutate({ id: t.id, code: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">Pricing model</label>
            <select
              value={t.model}
              onChange={(e) => update.mutate({ id: t.id, model: e.target.value as PricingType["model"] })}
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="HOURLY">Hourly</option>
              <option value="FIXED">Flat / all-day</option>
              <option value="PACKAGE">Package</option>
            </select>
          </div>
          {t.model === "HOURLY" ? (
            <div>
              <label className="text-xs text-foreground-muted">Hourly rate ฿</label>
              <TextInput
                type="number"
                defaultValue={t.hourlyRate ?? ""}
                onBlur={(e) => {
                  const n = e.target.value ? Number(e.target.value) : null;
                  if (n !== t.hourlyRate) update.mutate({ id: t.id, hourlyRate: n });
                }}
              />
            </div>
          ) : (
            <div>
              <label className="text-xs text-foreground-muted">Fixed price ฿</label>
              <TextInput
                type="number"
                defaultValue={t.fixedPrice ?? ""}
                onBlur={(e) => {
                  const n = e.target.value ? Number(e.target.value) : null;
                  if (n !== t.fixedPrice) update.mutate({ id: t.id, fixedPrice: n });
                }}
              />
            </div>
          )}
          <div>
            <label className="text-xs text-foreground-muted">Daily cap ฿ (optional)</label>
            <TextInput
              type="number"
              defaultValue={t.dailyCap ?? ""}
              onBlur={(e) => {
                const n = e.target.value ? Number(e.target.value) : null;
                if (n !== t.dailyCap) update.mutate({ id: t.id, dailyCap: n });
              }}
            />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">Grace period (minutes)</label>
            <TextInput
              type="number"
              defaultValue={t.gracePeriodMinutes}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n) && n !== t.gracePeriodMinutes) {
                  update.mutate({ id: t.id, gracePeriodMinutes: n });
                }
              }}
            />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">Start time (optional)</label>
            <TextInput
              type="time"
              defaultValue={t.startTime ?? ""}
              onBlur={(e) => update.mutate({ id: t.id, startTime: e.target.value || null })}
            />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">End time (optional)</label>
            <TextInput
              type="time"
              defaultValue={t.endTime ?? ""}
              onBlur={(e) => update.mutate({ id: t.id, endTime: e.target.value || null })}
            />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">Active from (optional)</label>
            <TextInput
              type="date"
              defaultValue={toDateInputValue(t.activeFrom)}
              onBlur={(e) =>
                update.mutate({
                  id: t.id,
                  activeFrom: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
            />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">Active to (optional)</label>
            <TextInput
              type="date"
              defaultValue={toDateInputValue(t.activeTo)}
              onBlur={(e) =>
                update.mutate({
                  id: t.id,
                  activeTo: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
            />
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-foreground-muted">Active days (leave all off = every day)</p>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((label, i) => (
              <ToggleButton key={i} on={days.has(i)} onLabel={label} onClick={() => toggleDay(i)} />
            ))}
          </div>
        </div>

        <ToggleButton
          on={t.perPerson}
          onLabel="Per person"
          offLabel="Per table"
          onClick={() => update.mutate({ id: t.id, perPerson: !t.perPerson })}
        />

        <div className="flex items-center justify-between border-t border-border pt-3">
          {t.inUse ? (
            <p className="text-xs text-foreground-muted">
              Already used by a session or reservation — mark Inactive instead of deleting.
            </p>
          ) : confirmingDelete ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-status-danger">Delete for good?</span>
              <button
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: t.id })}
                className="font-medium text-status-danger underline"
              >
                Confirm
              </button>
              <button onClick={() => setConfirmingDelete(false)} className="text-foreground-muted underline">
                Cancel
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmingDelete(true)} className="text-xs text-status-danger underline">
              Delete
            </button>
          )}
          <Button size="md" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        {(update.error || remove.error) && (
          <p className="text-xs text-status-danger">{(update.error ?? remove.error)?.message}</p>
        )}
      </div>
    </Modal>
  );
}

function PricingTypeRow({ pricingType: t }: { pricingType: PricingType }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const update = trpc.pricingTypes.update.useMutation({
    onSuccess: () =>
      Promise.all([utils.pricingTypes.listAll.invalidate(), utils.pricingTypes.list.invalidate()]),
  });

  return (
    <>
      <Card className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">
            {t.name} <span className="text-xs text-foreground-muted">({t.code})</span>
          </p>
          <p className="text-sm text-foreground-muted">
            {MODEL_LABELS[t.model]} · {summaryLine(t)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleButton
            on={t.active}
            onLabel="Active"
            offLabel="Inactive"
            onClick={() => update.mutate({ id: t.id, active: !t.active })}
          />
          <Button size="md" variant="outline" onClick={() => setOpen(true)}>
            Details
          </Button>
        </div>
      </Card>
      {open && <PricingTypeDetailsModal pricingType={t} onClose={() => setOpen(false)} />}
    </>
  );
}

function CreatePricingTypeForm() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState<PricingType["model"]>("HOURLY");
  const [rate, setRate] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.pricingTypes.create.useMutation({
    onSuccess: async () => {
      setCode("");
      setName("");
      setRate("");
      await Promise.all([utils.pricingTypes.listAll.invalidate(), utils.pricingTypes.list.invalidate()]);
    },
  });

  const isHourly = model === "HOURLY";
  const canSubmit = code && name && rate;

  return (
    <Card className="flex flex-wrap items-end gap-2">
      <div className="w-28">
        <label className="text-xs text-foreground-muted">Code</label>
        <TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="DND" />
      </div>
      <div className="w-48">
        <label className="text-xs text-foreground-muted">Name</label>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="D&D Table" />
      </div>
      <div className="w-40">
        <label className="text-xs text-foreground-muted">Pricing model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value as PricingType["model"])}
          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="HOURLY">Hourly</option>
          <option value="FIXED">Flat / all-day</option>
          <option value="PACKAGE">Package</option>
        </select>
      </div>
      <div className="w-32">
        <label className="text-xs text-foreground-muted">{isHourly ? "Rate ฿/hr" : "Price ฿"}</label>
        <TextInput type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
      </div>
      {create.error && <p className="w-full text-xs text-status-danger">{create.error.message}</p>}
      <Button
        size="md"
        disabled={!canSubmit || create.isPending}
        onClick={() =>
          create.mutate({
            code,
            name,
            model,
            hourlyRate: isHourly ? Number(rate) : undefined,
            fixedPrice: isHourly ? undefined : Number(rate),
          })
        }
      >
        Add pricing type
      </Button>
    </Card>
  );
}

export function PricingTypesManager() {
  const { data: pricingTypes } = trpc.pricingTypes.listAll.useQuery();

  return (
    <div className="space-y-4">
      <CreatePricingTypeForm />
      <p className="text-xs text-foreground-muted">
        Set up with a code/name/model/rate above, then open{" "}
        <span className="font-medium text-foreground">Details</span> on a pricing type below to
        fine-tune its daily cap, grace period, day/time window, and per-person vs per-table billing.
        These show up in the &quot;Open Table&quot; and Reservation pricing pickers as soon as they&apos;re Active.
      </p>
      <div className="space-y-2">
        {pricingTypes?.map((t) => (
          <PricingTypeRow key={t.id} pricingType={t} />
        ))}
        {pricingTypes?.length === 0 && (
          <p className="text-sm text-foreground-muted">No pricing types yet — add one above.</p>
        )}
      </div>
    </div>
  );
}
