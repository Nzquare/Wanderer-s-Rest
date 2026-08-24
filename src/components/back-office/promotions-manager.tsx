"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleButton } from "@/components/ui/toggle-button";
import { Modal } from "@/components/ui/modal";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-teal-500"
    />
  );
}

type Promotion = {
  id: string;
  name: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_ITEM";
  value: number;
  rewardMenuItemId: string | null;
  rewardMenuItemName: string | null;
  rewardMenuItemPrice: number | null;
  startDate: string | Date | null;
  endDate: string | Date | null;
  activeDays: number[] | null;
  startTime: string | null;
  endTime: string | null;
  minimumSpend: number | null;
  memberOnly: boolean;
  stackable: boolean;
  active: boolean;
};

function toDateInputValue(d: string | Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function summaryLine(promotion: Promotion): string {
  return promotion.type === "PERCENTAGE"
    ? `${promotion.value}% off`
    : promotion.type === "FIXED_AMOUNT"
      ? `฿${promotion.value} off`
      : `Free: ${promotion.rewardMenuItemName ?? "no item chosen"}`;
}

/** Flat "Category — Item" dropdown built from the same data the order screen uses. */
function MenuItemSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (menuItemId: string) => void;
}) {
  const { data: categories } = trpc.menu.listForOrdering.useQuery();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
    >
      <option value="">Choose an item…</option>
      {categories?.map((cat) => (
        <optgroup key={cat.id} label={cat.nameEn}>
          {cat.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nameEn} — ฿{item.basePrice}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/**
 * Full edit form, shown in a popup rather than inline — with a long
 * promotion list, expanding every field for every row at once made the
 * page unusable, so the list only shows a compact summary and this modal
 * is where the fine-tuning (dates, days, eligibility, delete) happens.
 */
function PromotionDetailsModal({
  promotion,
  onClose,
}: {
  promotion: Promotion;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const invalidate = () => utils.promotions.listAll.invalidate();
  const update = trpc.promotions.update.useMutation({ onSuccess: invalidate });
  const remove = trpc.promotions.remove.useMutation({
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const days = new Set(promotion.activeDays ?? []);
  function toggleDay(d: number) {
    const next = new Set(days);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    update.mutate({ id: promotion.id, activeDays: Array.from(next) });
  }

  return (
    <Modal open onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <input
              defaultValue={promotion.name}
              onBlur={(e) =>
                e.target.value !== promotion.name &&
                update.mutate({ id: promotion.id, name: e.target.value })
              }
              className="rounded border border-transparent bg-transparent text-lg font-medium text-foreground hover:border-border focus:border-teal-500 focus:outline-none"
            />
            <p className="text-sm text-foreground-muted">{summaryLine(promotion)}</p>
          </div>
          <ToggleButton
            on={promotion.active}
            onLabel="Active"
            offLabel="Inactive"
            onClick={() => update.mutate({ id: promotion.id, active: !promotion.active })}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-foreground-muted">Discount type</label>
            <select
              value={promotion.type}
              onChange={(e) =>
                update.mutate({ id: promotion.id, type: e.target.value as Promotion["type"] })
              }
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="PERCENTAGE">% off</option>
              <option value="FIXED_AMOUNT">฿ fixed off</option>
              <option value="FREE_ITEM">Free item / goods</option>
            </select>
          </div>
          {promotion.type === "FREE_ITEM" ? (
            <div>
              <label className="text-xs text-foreground-muted">
                Item to give away (must be in the guest&apos;s order to redeem)
              </label>
              <MenuItemSelect
                value={promotion.rewardMenuItemId ?? ""}
                onChange={(menuItemId) => update.mutate({ id: promotion.id, rewardMenuItemId: menuItemId })}
              />
            </div>
          ) : (
            <div>
              <label className="text-xs text-foreground-muted">Value</label>
              <TextInput
                type="number"
                defaultValue={promotion.value}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isNaN(n) && n !== promotion.value) update.mutate({ id: promotion.id, value: n });
                }}
              />
            </div>
          )}
          <div>
            <label className="text-xs text-foreground-muted">Start date (optional)</label>
            <TextInput
              type="date"
              defaultValue={toDateInputValue(promotion.startDate)}
              onBlur={(e) =>
                update.mutate({
                  id: promotion.id,
                  startDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
            />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">End date (optional)</label>
            <TextInput
              type="date"
              defaultValue={toDateInputValue(promotion.endDate)}
              onBlur={(e) =>
                update.mutate({
                  id: promotion.id,
                  endDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
            />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">Start time (optional)</label>
            <TextInput
              type="time"
              defaultValue={promotion.startTime ?? ""}
              onBlur={(e) => update.mutate({ id: promotion.id, startTime: e.target.value || null })}
            />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">End time (optional)</label>
            <TextInput
              type="time"
              defaultValue={promotion.endTime ?? ""}
              onBlur={(e) => update.mutate({ id: promotion.id, endTime: e.target.value || null })}
            />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">Minimum spend ฿ (optional)</label>
            <TextInput
              type="number"
              defaultValue={promotion.minimumSpend ?? ""}
              onBlur={(e) =>
                update.mutate({
                  id: promotion.id,
                  minimumSpend: e.target.value ? Number(e.target.value) : null,
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

        <div className="flex flex-wrap gap-2">
          <ToggleButton
            on={promotion.memberOnly}
            onLabel="Members only"
            offLabel="Everyone"
            onClick={() => update.mutate({ id: promotion.id, memberOnly: !promotion.memberOnly })}
          />
          <span title="Stackable: can be applied more than once to the same bill (e.g. a second Free Item on top of one already given). Exclusive: once per bill.">
            <ToggleButton
              on={promotion.stackable}
              onLabel="Stackable"
              offLabel="Exclusive"
              onClick={() => update.mutate({ id: promotion.id, stackable: !promotion.stackable })}
            />
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          {confirmingDelete ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-status-danger">Delete for good?</span>
              <button
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: promotion.id })}
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
        {remove.error && confirmingDelete && (
          <div className="text-right">
            <p className="text-xs text-status-danger">{remove.error.message}</p>
            {/* CONFLICT = "already applied to a bill" — force-able, unlike
                the achievement/benefit-redemption blocks (BAD_REQUEST). */}
            {remove.error.data?.code === "CONFLICT" && (
              <button
                onClick={() => remove.mutate({ id: promotion.id, force: true })}
                disabled={remove.isPending}
                className="mt-1 text-xs font-medium text-status-danger underline"
              >
                Delete anyway — its past usage stays on record as
                &quot;Manual / custom discount&quot;, but it comes off
                Promotions entirely.
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function PromotionSummaryRow({ promotion }: { promotion: Promotion }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const update = trpc.promotions.update.useMutation({
    onSuccess: () => utils.promotions.listAll.invalidate(),
  });

  return (
    <>
      <Card className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{promotion.name}</p>
          <p className="text-sm text-foreground-muted">{summaryLine(promotion)}</p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleButton
            on={promotion.active}
            onLabel="Active"
            offLabel="Inactive"
            onClick={() => update.mutate({ id: promotion.id, active: !promotion.active })}
          />
          <Button size="md" variant="outline" onClick={() => setOpen(true)}>
            Details
          </Button>
        </div>
      </Card>
      {open && <PromotionDetailsModal promotion={promotion} onClose={() => setOpen(false)} />}
    </>
  );
}

function CreatePromotionForm() {
  const [name, setName] = useState("");
  const [type, setType] = useState<Promotion["type"]>("PERCENTAGE");
  const [value, setValue] = useState("");
  const [rewardMenuItemId, setRewardMenuItemId] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.promotions.create.useMutation({
    onSuccess: async () => {
      setName("");
      setValue("");
      setRewardMenuItemId("");
      await utils.promotions.listAll.invalidate();
    },
  });

  const isFreeItem = type === "FREE_ITEM";
  const canSubmit = name && (isFreeItem ? rewardMenuItemId : value);

  return (
    <Card className="flex flex-wrap items-end gap-2">
      <div className="w-56">
        <label className="text-xs text-foreground-muted">Name</label>
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Happy Hour"
        />
      </div>
      <div className="w-32">
        <label className="text-xs text-foreground-muted">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="PERCENTAGE">% off</option>
          <option value="FIXED_AMOUNT">฿ fixed off</option>
          <option value="FREE_ITEM">Free item / goods</option>
        </select>
      </div>
      {isFreeItem ? (
        <div className="w-64">
          <label className="text-xs text-foreground-muted">Item to give away</label>
          <MenuItemSelect value={rewardMenuItemId} onChange={setRewardMenuItemId} />
        </div>
      ) : (
        <div className="w-24">
          <label className="text-xs text-foreground-muted">Value</label>
          <TextInput type="number" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
      )}
      {create.error && <p className="w-full text-xs text-status-danger">{create.error.message}</p>}
      <Button
        size="md"
        disabled={!canSubmit || create.isPending}
        onClick={() =>
          create.mutate({
            name,
            type,
            value: isFreeItem ? 0 : Number(value),
            rewardMenuItemId: isFreeItem ? rewardMenuItemId : undefined,
          })
        }
      >
        Add promotion
      </Button>
    </Card>
  );
}

export function PromotionsManager() {
  const { data: promotions } = trpc.promotions.listAll.useQuery();

  return (
    <div className="space-y-4">
      <CreatePromotionForm />
      <p className="text-xs text-foreground-muted">
        Set up with just a name/type/value above, then open{" "}
        <span className="font-medium text-foreground">Details</span> on a promotion below to
        fine-tune its window, days, and eligibility. A &quot;Free item&quot; promotion only shows
        up at checkout once the guest has actually ordered that item — it can&apos;t give away
        something they didn&apos;t order.
      </p>
      <div className="space-y-2">
        {promotions?.map((p) => (
          <PromotionSummaryRow key={p.id} promotion={p} />
        ))}
        {promotions?.length === 0 && (
          <p className="text-sm text-foreground-muted">No promotions yet — add one above.</p>
        )}
      </div>
    </div>
  );
}
