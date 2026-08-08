"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

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
interface MenuItem {
  id: string;
  nameEn: string;
  basePrice: number;
  soldOut: boolean;
  modifierGroups: ModifierGroup[];
}

interface CartLine {
  key: string;
  menuItemId: string;
  nameEn: string;
  quantity: number;
  unitPrice: number;
  modifierOptionIds: string[];
  modifierLabel: string;
}

export function OrderPanel({
  sessionId,
  tableId,
  source,
}: {
  sessionId: string;
  tableId: string;
  source: "CASHIER" | "STAFF";
}) {
  const { data: categories, isLoading } = trpc.menu.listForOrdering.useQuery();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [pickingItem, setPickingItem] = useState<MenuItem | null>(null);
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const utils = trpc.useUtils();

  const submit = trpc.orders.add.useMutation({
    onSuccess: async () => {
      setCart([]);
      await Promise.all([
        utils.sessions.getTableDetail.invalidate({ tableId }),
        utils.sessions.listTables.invalidate(),
      ]);
    },
  });

  const activeCategory =
    categories?.find((c) => c.id === activeCategoryId) ?? categories?.[0];

  function startAdd(item: MenuItem) {
    if (item.soldOut) return;
    if (item.modifierGroups.length === 0) {
      addToCart(item, [], "");
      return;
    }
    setPickingItem(item);
    setSelection({});
  }

  function addToCart(
    item: MenuItem,
    modifierOptionIds: string[],
    modifierLabel: string,
  ) {
    const unitPrice =
      item.basePrice +
      item.modifierGroups
        .flatMap((g) => g.options)
        .filter((o) => modifierOptionIds.includes(o.id))
        .reduce((s, o) => s + o.priceAdjustment, 0);
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
    addToCart(pickingItem, chosenIds, labels.join(", "));
  }

  const pickerValid = useMemo(() => {
    if (!pickingItem) return false;
    return pickingItem.modifierGroups.every((g) => {
      const count = selection[g.id]?.length ?? 0;
      if (g.required && count < Math.max(1, g.minSelect)) return false;
      return true;
    });
  }, [pickingItem, selection]);

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
              "rounded-xl border border-border p-3 text-left disabled:opacity-40",
              !item.soldOut && "active:scale-[0.98]",
            )}
          >
            <p className="text-sm font-medium text-foreground">{item.nameEn}</p>
            <p className="text-sm text-foreground-muted">
              {item.soldOut ? "Sold out" : `฿${item.basePrice}`}
            </p>
          </button>
        ))}
      </div>

      {pickingItem && (
        <div className="space-y-3 rounded-xl border border-teal-500 bg-teal-500/5 p-3">
          <p className="text-sm font-semibold text-foreground">
            {pickingItem.nameEn}
          </p>
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
                {line.modifierLabel && (
                  <span className="text-foreground-muted"> ({line.modifierLabel})</span>
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
            onClick={() =>
              submit.mutate({
                sessionId,
                source,
                items: cart.map((l) => ({
                  menuItemId: l.menuItemId,
                  quantity: l.quantity,
                  modifierOptionIds: l.modifierOptionIds,
                })),
              })
            }
          >
            {submit.isPending ? "Sending…" : "Submit Order"}
          </Button>
        </div>
      )}
    </div>
  );
}
