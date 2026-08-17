"use client";

import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { playChime } from "@/lib/chime";
import { printOnce } from "@/lib/print-once";
import { KitchenTicket, type KitchenTicketOrder } from "./kitchen-ticket";

interface ModifierOption {
  id: string;
  nameEn: string;
  priceAdjustment: number;
  soldOut: boolean;
}
interface ModifierGroup {
  id: string;
  nameEn: string;
  required: boolean;
  multiSelect: boolean;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
}
interface ComboSlot {
  id: string;
  nameEn: string;
  extraCharge: number;
  eligibleItems: { id: string; nameEn: string; basePrice: number }[];
}
interface MenuItem {
  id: string;
  nameEn: string;
  basePrice: number;
  soldOut: boolean;
  photoUrl: string | null;
  modifierGroups: ModifierGroup[];
  isCombo: boolean;
  comboSlots: ComboSlot[];
}

/** First-letter placeholder tile for items without a photo yet — still
 * scannable at a glance, never just bare text (§47 "large menu images"). */
function ItemThumb({ item }: { item: Pick<MenuItem, "nameEn" | "photoUrl"> }) {
  if (item.photoUrl) {
    // Staff-pasted URLs can come from anywhere, so a plain <img> avoids
    // Next/Image's remote-domain allowlist friction.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.photoUrl}
        alt={item.nameEn}
        loading="lazy"
        className="h-24 w-full rounded-lg object-cover sm:h-28"
      />
    );
  }
  return (
    <div className="flex h-24 w-full items-center justify-center rounded-lg bg-brand-900/10 text-2xl font-semibold text-brand-700 dark:bg-white/5 dark:text-teal-400 sm:h-28">
      {item.nameEn.charAt(0).toUpperCase()}
    </div>
  );
}

interface ComboSelectionLine {
  comboSlotId: string;
  selectedMenuItemId: string;
  label: string;
}
interface CartLine {
  key: string;
  menuItemId: string;
  nameEn: string;
  quantity: number;
  unitPrice: number;
  modifierOptionIds: string[];
  modifierLabel: string;
  comboSelections: ComboSelectionLine[];
}

export function OrderPanel({
  sessionId,
  tableId,
  tableCode,
  source,
}: {
  sessionId: string;
  tableId: string;
  tableCode: string;
  source: "CASHIER" | "STAFF";
}) {
  const { data: categories, isLoading } = trpc.menu.listForOrdering.useQuery();
  const { data: notificationSettings } = trpc.settings.getNotifications.useQuery();
  const { data: checkoutSettings } = trpc.settings.getCheckout.useQuery();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [pickingItem, setPickingItem] = useState<MenuItem | null>(null);
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [comboSelection, setComboSelection] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const utils = trpc.useUtils();

  // Snapshot of the cart at the moment "Submit Order" was clicked — read
  // back in onSuccess rather than closing over `cart` directly, since the
  // cart's already been cleared by the time this fires (§Kitchen order
  // printing for cashier-entered orders — the cashier's own table page has
  // no separate "unacknowledged order" flow to catch this from, unlike
  // Staff/Customer-QR orders, so the kitchen ticket has to fire right here).
  const pendingTicket = useRef<KitchenTicketOrder | null>(null);
  const [printOrder, setPrintOrder] = useState<KitchenTicketOrder | null>(null);

  const submit = trpc.orders.add.useMutation({
    onSuccess: async () => {
      const ticket = pendingTicket.current;
      pendingTicket.current = null;
      setCart([]);
      await Promise.all([
        utils.sessions.getTableDetail.invalidate({ tableId }),
        utils.sessions.listTables.invalidate(),
      ]);
      if (ticket) {
        if (notificationSettings?.cashierSoundEnabled) {
          playChime(notificationSettings.volume);
        }
        if (notificationSettings?.autoPrintKitchenTicket) {
          printOnce(
            () => setPrintOrder(ticket),
            () => setPrintOrder(null),
          );
        }
      }
    },
  });

  const activeCategory =
    categories?.find((c) => c.id === activeCategoryId) ?? categories?.[0];

  function startAdd(item: MenuItem) {
    if (item.soldOut) return;
    if (item.modifierGroups.length === 0 && item.comboSlots.length === 0) {
      addToCart(item, [], "", []);
      return;
    }
    setPickingItem(item);
    setSelection({});
    setComboSelection({});
  }

  function addToCart(
    item: MenuItem,
    modifierOptionIds: string[],
    modifierLabel: string,
    comboSelections: ComboSelectionLine[],
  ) {
    const modifierTotal = item.modifierGroups
      .flatMap((g) => g.options)
      .filter((o) => modifierOptionIds.includes(o.id))
      .reduce((s, o) => s + o.priceAdjustment, 0);
    const comboExtraTotal = item.comboSlots
      .filter((slot) => comboSelections.some((cs) => cs.comboSlotId === slot.id))
      .reduce((s, slot) => s + slot.extraCharge, 0);
    const unitPrice = item.basePrice + modifierTotal + comboExtraTotal;
    setCart((c) => [
      ...c,
      {
        key: `${item.id}-${Date.now()}-${Math.random()}`,
        menuItemId: item.id,
        nameEn: item.nameEn,
        quantity: 1,
        unitPrice,
        modifierOptionIds,
        modifierLabel,
        comboSelections,
      },
    ]);
    setPickingItem(null);
  }

  function confirmPicker() {
    if (!pickingItem) return;
    const chosenIds = Object.values(selection).flat();
    const labels = pickingItem.modifierGroups
      .flatMap((g) => g.options)
      .filter((o) => chosenIds.includes(o.id))
      .map((o) => o.nameEn);
    const comboSelections: ComboSelectionLine[] = pickingItem.comboSlots
      .filter((slot) => comboSelection[slot.id])
      .map((slot) => {
        const chosenItem = slot.eligibleItems.find((i) => i.id === comboSelection[slot.id]);
        return {
          comboSlotId: slot.id,
          selectedMenuItemId: comboSelection[slot.id],
          label: `${slot.nameEn}: ${chosenItem?.nameEn ?? "?"}`,
        };
      });
    addToCart(pickingItem, chosenIds, labels.join(", "), comboSelections);
  }

  const pickerValid = useMemo(() => {
    if (!pickingItem) return false;
    const modifiersOk = pickingItem.modifierGroups.every((g) => {
      const count = selection[g.id]?.length ?? 0;
      if (g.required && count < Math.max(1, g.minSelect)) return false;
      return true;
    });
    const comboOk = pickingItem.comboSlots.every((slot) => !!comboSelection[slot.id]);
    return modifiersOk && comboOk;
  }, [pickingItem, selection, comboSelection]);

  const cartTotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  if (isLoading) return <p className="text-sm text-foreground-muted">Loading menu…</p>;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm font-medium text-foreground-muted">Add order</p>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories?.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategoryId(cat.id)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-medium",
              activeCategory?.id === cat.id
                ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                : "border-border text-foreground-muted",
            )}
          >
            {cat.nameEn}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {activeCategory?.items.map((item) => (
          <button
            key={item.id}
            onClick={() => startAdd(item)}
            disabled={item.soldOut}
            className={cn(
              "space-y-1.5 rounded-xl border border-border p-2 text-left disabled:opacity-40",
              !item.soldOut && "active:scale-[0.98]",
            )}
          >
            <div className="relative">
              <ItemThumb item={item} />
              {item.soldOut && (
                <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 text-xs font-semibold text-white">
                  Sold out
                </span>
              )}
            </div>
            <p className="truncate text-sm font-medium text-foreground">
              {item.nameEn}
            </p>
            <p className="text-sm text-foreground-muted">฿{item.basePrice}</p>
          </button>
        ))}
      </div>

      {pickingItem && (
        <div className="space-y-3 rounded-xl border border-teal-500 bg-teal-500/5 p-3">
          <div className="flex items-center gap-3">
            {pickingItem.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pickingItem.photoUrl}
                alt={pickingItem.nameEn}
                className="h-14 w-14 rounded-lg object-cover"
              />
            )}
            <p className="text-sm font-semibold text-foreground">
              {pickingItem.nameEn}
            </p>
          </div>
          {pickingItem.comboSlots.map((slot) => (
            <div key={slot.id}>
              <p className="text-xs text-foreground-muted">
                {slot.nameEn} (required)
                {slot.extraCharge ? ` · +฿${slot.extraCharge}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {slot.eligibleItems.map((opt) => {
                  const selected = comboSelection[slot.id] === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setComboSelection((s) => ({ ...s, [slot.id]: opt.id }))}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm",
                        selected ? "border-teal-500 bg-teal-500/20" : "border-border",
                      )}
                    >
                      {opt.nameEn}
                    </button>
                  );
                })}
                {slot.eligibleItems.length === 0 && (
                  <p className="text-xs text-status-danger">No eligible items for this slot.</p>
                )}
              </div>
            </div>
          ))}
          {pickingItem.modifierGroups.map((group) => (
            <div key={group.id}>
              <p className="text-xs text-foreground-muted">
                {group.nameEn} {group.required && "(required)"}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {group.options.map((opt) => {
                  const selected = selection[group.id]?.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      disabled={opt.soldOut}
                      onClick={() =>
                        setSelection((s) => {
                          const current = s[group.id] ?? [];
                          if (group.multiSelect) {
                            return {
                              ...s,
                              [group.id]: current.includes(opt.id)
                                ? current.filter((id) => id !== opt.id)
                                : [...current, opt.id],
                            };
                          }
                          return { ...s, [group.id]: [opt.id] };
                        })
                      }
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm disabled:opacity-40",
                        selected
                          ? "border-teal-500 bg-teal-500/20"
                          : "border-border",
                      )}
                    >
                      {opt.nameEn}
                      {opt.priceAdjustment ? ` +฿${opt.priceAdjustment}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              size="md"
              variant="outline"
              onClick={() => setPickingItem(null)}
            >
              Cancel
            </Button>
            <Button size="md" disabled={!pickerValid} onClick={confirmPicker}>
              Add to order
            </Button>
          </div>
        </div>
      )}

      {cart.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          {cart.map((line) => (
            <div key={line.key} className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium text-foreground">{line.nameEn}</span>
                {(line.modifierLabel || line.comboSelections.length > 0) && (
                  <span className="text-foreground-muted">
                    {" "}
                    (
                    {[line.modifierLabel, ...line.comboSelections.map((cs) => cs.label)]
                      .filter(Boolean)
                      .join(", ")}
                    )
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setCart((c) =>
                      c
                        .map((l) =>
                          l.key === line.key
                            ? { ...l, quantity: l.quantity - 1 }
                            : l,
                        )
                        .filter((l) => l.quantity > 0),
                    )
                  }
                  className="h-7 w-7 rounded-full border border-border"
                >
                  −
                </button>
                <span className="w-4 text-center">{line.quantity}</span>
                <button
                  onClick={() =>
                    setCart((c) =>
                      c.map((l) =>
                        l.key === line.key
                          ? { ...l, quantity: l.quantity + 1 }
                          : l,
                      ),
                    )
                  }
                  className="h-7 w-7 rounded-full border border-border"
                >
                  +
                </button>
                <span className="w-14 text-right tabular-nums">
                  ฿{line.unitPrice * line.quantity}
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2">
            <span className="font-medium text-foreground">Order total</span>
            <span className="font-semibold text-foreground">฿{cartTotal}</span>
          </div>
          {submit.error && (
            <p className="text-sm text-status-danger">{submit.error.message}</p>
          )}
          <Button
            size="lg"
            className="w-full"
            disabled={submit.isPending}
            onClick={() => {
              // Only a Cashier-placed order needs its own immediate
              // chime + print — a Staff-phone order still gets picked up
              // by the Cashier screen's own alert banner/auto-print (§17),
              // and a phone has no kitchen printer to open a dialog on.
              if (source === "CASHIER") {
                pendingTicket.current = {
                  id: `local-${Date.now()}`,
                  tableCode,
                  source,
                  staffName: null,
                  createdAt: new Date(),
                  notes: null,
                  items: cart.map((l) => ({
                    id: l.key,
                    nameEn: l.nameEn,
                    quantity: l.quantity,
                    notes: null,
                    modifierNames: [
                      ...(l.modifierLabel ? l.modifierLabel.split(", ") : []),
                      ...l.comboSelections.map((cs) => cs.label),
                    ],
                    comboSelections: [],
                  })),
                };
              }
              submit.mutate({
                sessionId,
                source,
                items: cart.map((l) => ({
                  menuItemId: l.menuItemId,
                  quantity: l.quantity,
                  modifierOptionIds: l.modifierOptionIds,
                  comboSelections: l.comboSelections.map((cs) => ({
                    comboSlotId: cs.comboSlotId,
                    selectedMenuItemId: cs.selectedMenuItemId,
                  })),
                })),
              });
            }}
          >
            {submit.isPending ? "Sending…" : "Submit Order"}
          </Button>
        </div>
      )}
      {printOrder && (
        <KitchenTicket
          order={printOrder}
          printerWidthMm={checkoutSettings?.printerWidthMm ?? 80}
          printAreaId="kitchen-print-area-panel"
        />
      )}
    </div>
  );
}
