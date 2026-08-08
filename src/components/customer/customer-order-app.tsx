"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
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
  descriptionEn: string | null;
  basePrice: number;
  soldOut: boolean;
  photoUrl: string | null;
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

function ItemThumb({ item }: { item: Pick<MenuItem, "nameEn" | "photoUrl"> }) {
  if (item.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.photoUrl}
        alt={item.nameEn}
        loading="lazy"
        className="h-28 w-full rounded-xl object-cover"
      />
    );
  }
  return (
    <div className="flex h-28 w-full items-center justify-center rounded-xl bg-white/10 text-3xl font-semibold text-teal-300">
      {item.nameEn.charAt(0).toUpperCase()}
    </div>
  );
}

export function CustomerOrderApp({ qrToken }: { qrToken: string }) {
  const { data, isLoading } = trpc.customer.getMenu.useQuery(
    { qrToken },
    { refetchInterval: 20_000 },
  );
  const [view, setView] = useState<"menu" | "orders">("menu");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [pickingItem, setPickingItem] = useState<MenuItem | null>(null);
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const submit = trpc.customer.submitOrder.useMutation({
    onSuccess: () => {
      setCart([]);
      setConfirmed(true);
      setView("orders");
    },
  });

  const { data: myOrders } = trpc.customer.listMyOrders.useQuery(
    { qrToken },
    { refetchInterval: 8_000, enabled: view === "orders" },
  );

  const activeCategory =
    data?.categories.find((c) => c.id === activeCategoryId) ?? data?.categories[0];

  function startAdd(item: MenuItem) {
    if (item.soldOut) return;
    if (item.modifierGroups.length === 0) {
      addToCart(item, [], "");
      return;
    }
    setPickingItem(item);
    setSelection({});
  }

  function addToCart(item: MenuItem, modifierOptionIds: string[], modifierLabel: string) {
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

  if (isLoading || !data) {
    return <p className="text-center text-white/70">Loading menu…</p>;
  }

  if (!data.qrEnabled) {
    return (
      <p className="rounded-2xl bg-white/10 p-6 text-center text-white/80">
        Ordering from this table isn&apos;t available right now — please
        flag down a Tavern Keeper.
      </p>
    );
  }

  if (!data.hasActiveSession) {
    return (
      <p className="rounded-2xl bg-white/10 p-6 text-center text-white/80">
        This table hasn&apos;t been opened yet. Ask a Tavern Keeper to start
        your table, then refresh this page.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-full bg-white/10 p-1">
        <button
          onClick={() => setView("menu")}
          className={cn(
            "flex-1 rounded-full py-2 text-sm font-medium",
            view === "menu" ? "bg-teal-500 text-brand-950" : "text-white/70",
          )}
        >
          Menu
        </button>
        <button
          onClick={() => setView("orders")}
          className={cn(
            "flex-1 rounded-full py-2 text-sm font-medium",
            view === "orders" ? "bg-teal-500 text-brand-950" : "text-white/70",
          )}
        >
          My Orders
        </button>
      </div>

      {confirmed && (
        <div className="rounded-2xl bg-teal-500/20 p-4 text-center text-teal-200">
          Order sent to the kitchen! 🍗
        </div>
      )}

      {view === "orders" ? (
        <div className="space-y-2">
          {(!myOrders || myOrders.length === 0) && (
            <p className="text-center text-white/60">No orders submitted yet.</p>
          )}
          {myOrders?.map((order) => (
            <div key={order.id} className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wide text-white/50">
                {new Date(order.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              {order.items.map((item) => (
                <p key={item.id} className="text-sm text-white/90">
                  {item.quantity} × {item.nameEn}
                  {item.modifiers.length > 0 && (
                    <span className="text-white/60"> ({item.modifiers.join(", ")})</span>
                  )}
                </p>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {data.categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-sm font-medium",
                  activeCategory?.id === cat.id
                    ? "border-teal-400 bg-teal-500/20 text-teal-200"
                    : "border-white/20 text-white/70",
                )}
              >
                {cat.nameEn}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {activeCategory?.items.map((item) => (
              <button
                key={item.id}
                onClick={() => startAdd(item)}
                disabled={item.soldOut}
                className={cn(
                  "space-y-1.5 rounded-2xl bg-white/10 p-2 text-left disabled:opacity-40",
                )}
              >
                <div className="relative">
                  <ItemThumb item={item} />
                  {item.soldOut && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-xs font-semibold text-white">
                      Sold out
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-white">{item.nameEn}</p>
                <p className="text-sm text-teal-300">฿{item.basePrice}</p>
              </button>
            ))}
          </div>

          {pickingItem && (
            <div className="space-y-3 rounded-2xl border border-teal-400 bg-brand-900 p-4">
              <p className="font-semibold text-white">{pickingItem.nameEn}</p>
              {pickingItem.modifierGroups.map((group) => (
                <div key={group.id}>
                  <p className="text-xs text-white/60">
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
                            "rounded-lg border px-3 py-2 text-sm text-white disabled:opacity-40",
                            selected
                              ? "border-teal-400 bg-teal-500/30"
                              : "border-white/20",
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
                <button
                  onClick={() => setPickingItem(null)}
                  className="flex-1 rounded-xl border border-white/20 py-2.5 text-sm text-white"
                >
                  Cancel
                </button>
                <button
                  disabled={!pickerValid}
                  onClick={confirmPicker}
                  className="flex-1 rounded-xl bg-teal-500 py-2.5 text-sm font-semibold text-brand-950 disabled:opacity-40"
                >
                  Add to cart
                </button>
              </div>
            </div>
          )}

          {cart.length > 0 && (
            <div className="space-y-2 rounded-2xl bg-white/10 p-4">
              {cart.map((line) => (
                <div key={line.key} className="flex items-center justify-between text-sm text-white">
                  <div>
                    <span>{line.nameEn}</span>
                    {line.modifierLabel && (
                      <span className="text-white/60"> ({line.modifierLabel})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setCart((c) =>
                          c
                            .map((l) =>
                              l.key === line.key ? { ...l, quantity: l.quantity - 1 } : l,
                            )
                            .filter((l) => l.quantity > 0),
                        )
                      }
                      className="h-7 w-7 rounded-full border border-white/20"
                    >
                      −
                    </button>
                    <span className="w-4 text-center">{line.quantity}</span>
                    <button
                      onClick={() =>
                        setCart((c) =>
                          c.map((l) =>
                            l.key === line.key ? { ...l, quantity: l.quantity + 1 } : l,
                          ),
                        )
                      }
                      className="h-7 w-7 rounded-full border border-white/20"
                    >
                      +
                    </button>
                    <span className="w-14 text-right">฿{line.unitPrice * line.quantity}</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-white/10 pt-2 font-semibold text-white">
                <span>Total</span>
                <span>฿{cartTotal}</span>
              </div>
              {submit.error && (
                <p className="text-sm text-red-300">{submit.error.message}</p>
              )}
              <button
                disabled={submit.isPending}
                onClick={() => {
                  setConfirmed(false);
                  submit.mutate({
                    qrToken,
                    items: cart.map((l) => ({
                      menuItemId: l.menuItemId,
                      quantity: l.quantity,
                      modifierOptionIds: l.modifierOptionIds,
                    })),
                  });
                }}
                className="w-full rounded-xl bg-teal-500 py-3 font-semibold text-brand-950 disabled:opacity-50"
              >
                {submit.isPending ? "Sending…" : "Submit Order"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
