"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ToggleButton } from "@/components/ui/toggle-button";
import { ReorderHandle } from "@/components/ui/reorder-handle";
import { PhotoUpload } from "./photo-upload";
import { ExcelImportButton } from "./excel-import-button";
import { cn } from "@/lib/cn";
import { useDragReorder, type ReorderHandleProps, type ReorderRowProps } from "@/lib/use-drag-reorder";

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-teal-500",
        props.className,
      )}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-teal-500"
    />
  );
}

// ------------------------------------------------------------------------
// Categories — left rail: add, rename inline, delete (guarded server-side
// if items still live in it), active/inactive.
// ------------------------------------------------------------------------

type CategoryListItem = {
  id: string;
  nameTh: string;
  nameEn: string;
  active: boolean;
  _count: { items: number };
};

function CategoryRow({
  category,
  selected,
  onSelect,
  handleProps,
  rowProps,
  isDragging,
  isDropTarget,
}: {
  category: CategoryListItem;
  selected: boolean;
  onSelect: () => void;
  handleProps: ReorderHandleProps;
  rowProps: ReorderRowProps;
  isDragging: boolean;
  isDropTarget: boolean;
}) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [nameEn, setNameEn] = useState(category.nameEn);
  const [nameTh, setNameTh] = useState(category.nameTh);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const invalidate = () =>
    Promise.all([
      utils.menu.listCategories.invalidate(),
      utils.menu.listForOrdering.invalidate(),
    ]);
  const update = trpc.menu.updateCategory.useMutation({
    onSuccess: async () => {
      setEditing(false);
      await invalidate();
    },
  });
  const remove = trpc.menu.deleteCategory.useMutation({
    onSuccess: async () => {
      setConfirmingDelete(false);
      await invalidate();
    },
  });

  if (editing) {
    return (
      <div className="space-y-2 rounded-xl border border-teal-500 bg-background p-3">
        <TextInput value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="English name" />
        <TextInput value={nameTh} onChange={(e) => setNameTh(e.target.value)} placeholder="Thai name" />
        <div className="flex gap-2">
          <Button
            size="md"
            disabled={!nameEn || !nameTh || update.isPending}
            onClick={() => update.mutate({ id: category.id, nameEn, nameTh })}
          >
            Save
          </Button>
          <Button size="md" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      {...rowProps}
      className={cn(
        "flex w-full flex-col gap-1 rounded-xl border p-3 text-left transition-colors",
        isDragging && "opacity-40",
        isDropTarget
          ? "border-dashed border-teal-500"
          : selected
            ? "border-teal-500 bg-teal-500/10"
            : "border-border bg-background hover:border-foreground-muted",
      )}
    >
      <div className="flex items-start gap-2">
        <ReorderHandle handleProps={handleProps} className="mt-0.5" />
        {/* Only the name/count area is the "select" button — the action row
            below has its own buttons, and HTML doesn't allow nesting one
            button inside another. */}
        <button type="button" onClick={onSelect} className="flex flex-1 flex-col gap-1 text-left">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">{category.nameEn}</span>
            {!category.active && (
              <span className="rounded-full bg-status-neutral/15 px-2 py-0.5 text-[11px] text-status-neutral">
                Inactive
              </span>
            )}
          </div>
          <p className="text-xs text-foreground-muted">
            {category._count.items} item{category._count.items === 1 ? "" : "s"}
          </p>
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-teal-600 underline"
        >
          Rename
        </button>
        <button
          type="button"
          onClick={() =>
            update.mutate({ id: category.id, active: !category.active })
          }
          className="text-xs text-teal-600 underline"
        >
          {category.active ? "Deactivate" : "Activate"}
        </button>
        {confirmingDelete ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-status-danger">Delete?</span>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ id: category.id })}
              className="font-medium text-status-danger underline"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="text-foreground-muted underline"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-xs text-status-danger underline"
          >
            Delete
          </button>
        )}
      </div>
      {remove.error && confirmingDelete && (
        <p className="text-xs text-status-danger">{remove.error.message}</p>
      )}
    </div>
  );
}

function AddCategoryForm() {
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.menu.createCategory.useMutation({
    onSuccess: async () => {
      setNameTh("");
      setNameEn("");
      await utils.menu.listCategories.invalidate();
    },
  });
  return (
    <Card className="space-y-2">
      <p className="text-sm font-medium text-foreground">Add category</p>
      <TextInput value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="English name" />
      <TextInput value={nameTh} onChange={(e) => setNameTh(e.target.value)} placeholder="Thai name" />
      <Button
        size="md"
        className="w-full"
        disabled={!nameEn || !nameTh || create.isPending}
        onClick={() => create.mutate({ nameEn, nameTh })}
      >
        Add category
      </Button>
    </Card>
  );
}

// ------------------------------------------------------------------------
// Items — compact rows per selected category, click to open full editor.
// ------------------------------------------------------------------------

type OrderingItem = {
  id: string;
  nameEn: string;
  basePrice: number;
  soldOut: boolean;
  photoUrl: string | null;
};

function ItemRow({
  item,
  onEdit,
  handleProps,
  rowProps,
  isDragging,
  isDropTarget,
}: {
  item: OrderingItem;
  onEdit: () => void;
  handleProps: ReorderHandleProps;
  rowProps: ReorderRowProps;
  isDragging: boolean;
  isDropTarget: boolean;
}) {
  const utils = trpc.useUtils();
  const toggleSoldOut = trpc.menu.toggleSoldOut.useMutation({
    onSuccess: () => utils.menu.listForOrdering.invalidate(),
  });

  return (
    <div
      {...rowProps}
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm transition-colors",
        isDragging && "opacity-40",
        isDropTarget && "outline outline-2 outline-dashed outline-teal-500",
      )}
    >
      <div className="flex items-center gap-2">
        <ReorderHandle handleProps={handleProps} />
        <button onClick={onEdit} className="flex items-center gap-3 text-left">
          {item.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-foreground-muted">
              📷
            </span>
          )}
          <span>
            {item.nameEn} · ฿{item.basePrice}
          </span>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <ToggleButton
          on={!item.soldOut}
          onLabel="Available"
          offLabel="Sold out"
          tone={item.soldOut ? "danger" : "default"}
          onClick={() =>
            toggleSoldOut.mutate({ menuItemId: item.id, soldOut: !item.soldOut })
          }
        />
        <Button size="md" variant="outline" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </div>
  );
}

function QuickAddItemForm({ categoryId }: { categoryId: string }) {
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.menu.createItem.useMutation({
    onSuccess: async () => {
      setNameTh("");
      setNameEn("");
      setBasePrice("");
      await utils.menu.listForOrdering.invalidate();
    },
  });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-40">
        <label className="text-xs text-foreground-muted">English name</label>
        <TextInput value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </div>
      <div className="w-40">
        <label className="text-xs text-foreground-muted">Thai name</label>
        <TextInput value={nameTh} onChange={(e) => setNameTh(e.target.value)} />
      </div>
      <div className="w-24">
        <label className="text-xs text-foreground-muted">Price (฿)</label>
        <TextInput type="number" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
      </div>
      {create.error && <p className="w-full text-xs text-status-danger">{create.error.message}</p>}
      <Button
        size="md"
        variant="outline"
        disabled={!nameEn || !nameTh || !basePrice || create.isPending}
        onClick={() =>
          create.mutate({ categoryId, nameEn, nameTh, basePrice: Number(basePrice) })
        }
      >
        + Add item (edit for photo &amp; more)
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------------
// Item editor — full fields + photo upload + modifier group attach/detach,
// all in one place per the "adjust modifiers on the item itself" request.
// ------------------------------------------------------------------------

type ComboSlot = {
  id: string;
  nameTh: string;
  nameEn: string;
  categoryId: string | null;
  extraCharge: number;
};

function ComboSlotRow({
  slot,
  categories,
}: {
  slot: ComboSlot;
  categories: { id: string; nameEn: string }[];
}) {
  const utils = trpc.useUtils();
  const update = trpc.menu.updateComboSlot.useMutation({
    onSuccess: () => utils.menu.getItem.invalidate(),
  });
  const remove = trpc.menu.deleteComboSlot.useMutation({
    onSuccess: () => utils.menu.getItem.invalidate(),
  });

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg bg-background p-2">
      <div className="w-40">
        <label className="text-xs text-foreground-muted">Slot name</label>
        <TextInput
          defaultValue={slot.nameEn}
          onBlur={(e) =>
            e.target.value !== slot.nameEn && update.mutate({ id: slot.id, nameEn: e.target.value })
          }
        />
      </div>
      <div className="w-44">
        <label className="text-xs text-foreground-muted">Pick from category</label>
        <select
          value={slot.categoryId ?? ""}
          onChange={(e) => update.mutate({ id: slot.id, categoryId: e.target.value || null })}
          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="">Any active item</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameEn}
            </option>
          ))}
        </select>
      </div>
      <div className="w-28">
        <label className="text-xs text-foreground-muted">Extra charge (฿)</label>
        <TextInput
          type="number"
          defaultValue={slot.extraCharge}
          onBlur={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n) && n !== slot.extraCharge) update.mutate({ id: slot.id, extraCharge: n });
          }}
        />
      </div>
      <button
        onClick={() => remove.mutate({ id: slot.id })}
        disabled={remove.isPending}
        className="text-xs text-status-danger underline"
      >
        Remove slot
      </button>
    </div>
  );
}

function AddComboSlotForm({ itemId }: { itemId: string }) {
  const [nameEn, setNameEn] = useState("");
  const [nameTh, setNameTh] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.menu.createComboSlot.useMutation({
    onSuccess: async () => {
      setNameEn("");
      setNameTh("");
      await utils.menu.getItem.invalidate();
    },
  });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-40">
        <TextInput placeholder="Slot name (English)" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </div>
      <div className="w-40">
        <TextInput placeholder="Slot name (Thai)" value={nameTh} onChange={(e) => setNameTh(e.target.value)} />
      </div>
      <Button
        size="md"
        variant="outline"
        disabled={!nameEn || !nameTh || create.isPending}
        onClick={() => create.mutate({ comboItemId: itemId, nameEn, nameTh })}
      >
        + Add slot
      </Button>
    </div>
  );
}

/** Combo/set items (§11) are built from slots — "choose one Drink", "choose
 * one Side" — each optionally scoped to a category and carrying its own
 * surcharge. The cashier/staff order screen prompts for one pick per slot. */
function ComboSlotsSection({
  itemId,
  slots,
  categories,
}: {
  itemId: string;
  slots: ComboSlot[];
  categories: { id: string; nameEn: string }[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground-muted">
        Combo slots — what the customer picks when ordering this
      </p>
      <div className="space-y-1">
        {slots.map((slot) => (
          <ComboSlotRow key={slot.id} slot={slot} categories={categories} />
        ))}
        {slots.length === 0 && (
          <p className="text-xs text-foreground-muted">
            No slots yet — add one below (e.g. &quot;Drink&quot;, scoped to your Drinks category).
          </p>
        )}
      </div>
      <AddComboSlotForm itemId={itemId} />
    </div>
  );
}

function ItemEditor({
  itemId,
  categories,
  onClose,
}: {
  itemId: string;
  categories: { id: string; nameEn: string }[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: item } = trpc.menu.getItem.useQuery({ id: itemId });
  const { data: allGroups } = trpc.menu.listModifierGroups.useQuery();

  const invalidateAll = () =>
    Promise.all([
      utils.menu.getItem.invalidate({ id: itemId }),
      utils.menu.listForOrdering.invalidate(),
      utils.menu.listCategories.invalidate(),
    ]);

  const update = trpc.menu.updateItem.useMutation({ onSuccess: invalidateAll });
  const attach = trpc.menu.attachModifierGroup.useMutation({ onSuccess: invalidateAll });
  const detach = trpc.menu.detachModifierGroup.useMutation({ onSuccess: invalidateAll });
  const remove = trpc.menu.deleteItem.useMutation({
    onSuccess: async () => {
      await invalidateAll();
      onClose();
    },
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!item) {
    return (
      <div className="p-4 text-sm text-foreground-muted">Loading item…</div>
    );
  }

  const attachedIds = new Set(item.modifierGroups.map((l) => l.modifierGroup.id));

  return (
    <div className="max-h-[80vh] space-y-5 overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">Edit item</h3>
        <button onClick={onClose} className="text-sm text-foreground-muted hover:text-foreground">
          ✕ Close
        </button>
      </div>

      <PhotoUpload
        value={item.photoUrl}
        onChange={(dataUrl) => update.mutate({ id: item.id, photoUrl: dataUrl })}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-foreground-muted">English name</label>
          <TextInput
            defaultValue={item.nameEn}
            onBlur={(e) => e.target.value !== item.nameEn && update.mutate({ id: item.id, nameEn: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-foreground-muted">Thai name</label>
          <TextInput
            defaultValue={item.nameTh}
            onBlur={(e) => e.target.value !== item.nameTh && update.mutate({ id: item.id, nameTh: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-foreground-muted">Price (฿)</label>
          <TextInput
            type="number"
            defaultValue={item.basePrice}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (!Number.isNaN(n) && n !== item.basePrice) update.mutate({ id: item.id, basePrice: n });
            }}
          />
        </div>
        <div>
          <label className="text-xs text-foreground-muted">Category</label>
          <select
            value={item.categoryId}
            onChange={(e) => update.mutate({ id: item.id, categoryId: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameEn}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-foreground-muted">English description</label>
          <TextArea
            rows={2}
            defaultValue={item.descriptionEn ?? ""}
            onBlur={(e) => update.mutate({ id: item.id, descriptionEn: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-foreground-muted">Thai description</label>
          <TextArea
            rows={2}
            defaultValue={item.descriptionTh ?? ""}
            onBlur={(e) => update.mutate({ id: item.id, descriptionTh: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-foreground-muted">Staff notes</label>
        <TextArea
          rows={2}
          defaultValue={item.notes ?? ""}
          onBlur={(e) => update.mutate({ id: item.id, notes: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground-muted">Status &amp; visibility</p>
        <div className="flex flex-wrap gap-2">
          <ToggleButton
            on={item.active}
            onLabel="Active"
            offLabel="Inactive"
            onClick={() => update.mutate({ id: item.id, active: !item.active })}
          />
          <ToggleButton
            on={!item.soldOut}
            onLabel="Available"
            offLabel="Sold out"
            tone={item.soldOut ? "danger" : "default"}
            onClick={() => update.mutate({ id: item.id, soldOut: !item.soldOut })}
          />
          <ToggleButton
            on={item.featured}
            onLabel="Featured"
            onClick={() => update.mutate({ id: item.id, featured: !item.featured })}
          />
          <ToggleButton
            on={item.seasonal}
            onLabel="Seasonal"
            onClick={() => update.mutate({ id: item.id, seasonal: !item.seasonal })}
          />
          <ToggleButton
            on={item.isNew}
            onLabel="New"
            onClick={() => update.mutate({ id: item.id, isNew: !item.isNew })}
          />
          <ToggleButton
            on={item.staffOnly}
            onLabel="Staff-only"
            onClick={() => update.mutate({ id: item.id, staffOnly: !item.staffOnly })}
          />
          <ToggleButton
            on={item.customerVisible}
            onLabel="Visible to customers"
            offLabel="Hidden from customers"
            onClick={() => update.mutate({ id: item.id, customerVisible: !item.customerVisible })}
          />
          <ToggleButton
            on={item.discountEligible}
            offLabel="No discounts"
            onLabel="Discount-eligible"
            onClick={() => update.mutate({ id: item.id, discountEligible: !item.discountEligible })}
          />
          <ToggleButton
            on={item.isCombo}
            onLabel="Combo/set item"
            offLabel="Single item"
            onClick={() => update.mutate({ id: item.id, isCombo: !item.isCombo })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground-muted">Modifier groups on this item</p>
        {allGroups && allGroups.length > 0 ? (
          <div className="space-y-1 rounded-lg bg-background p-2">
            {allGroups.map((g) => {
              const on = attachedIds.has(g.id);
              return (
                <div key={g.id} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-sm text-foreground">
                    {g.nameEn}
                    {g.required && <span className="text-foreground-muted"> · required</span>}
                  </span>
                  <ToggleButton
                    on={on}
                    onLabel="Attached"
                    offLabel="Attach"
                    onClick={() =>
                      on
                        ? detach.mutate({ menuItemId: item.id, modifierGroupId: g.id })
                        : attach.mutate({ menuItemId: item.id, modifierGroupId: g.id })
                    }
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-foreground-muted">
            No modifier groups yet — add one in the Modifier Groups tab first.
          </p>
        )}
      </div>

      {item.isCombo && <ComboSlotsSection itemId={item.id} slots={item.comboSlots} categories={categories} />}

      <div className="flex items-center justify-between border-t border-border pt-3">
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-status-danger">Delete this item for good?</span>
            <Button size="md" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate({ id: item.id })}>
              Confirm delete
            </Button>
            <Button size="md" variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="text-xs text-status-danger underline"
          >
            Delete item
          </button>
        )}
        {remove.error && (
          <div className="text-right">
            <p className="text-xs text-status-danger">{remove.error.message}</p>
            {/* CONFLICT = "has order history" (§Delete anyway) — force-able.
                Anything else (e.g. the promotion-reward block) isn't. */}
            {remove.error.data?.code === "CONFLICT" && (
              <button
                onClick={() => remove.mutate({ id: item.id, force: true })}
                disabled={remove.isPending}
                className="mt-1 text-xs font-medium text-status-danger underline"
              >
                Delete anyway — its name/price stay on past receipts, but
                it comes off the catalog entirely.
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------
// Modifier groups — reusable across items, so managed as their own list.
// ------------------------------------------------------------------------

function ModifierOptionRow({ option }: { option: { id: string; nameEn: string; nameTh: string; priceAdjustment: unknown; active: boolean; soldOut: boolean } }) {
  const utils = trpc.useUtils();
  const invalidate = () =>
    Promise.all([utils.menu.listModifierGroups.invalidate(), utils.menu.listForOrdering.invalidate()]);
  const update = trpc.menu.updateModifierOption.useMutation({ onSuccess: invalidate });
  const remove = trpc.menu.deleteModifierOption.useMutation({ onSuccess: invalidate });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-2 py-1.5">
      <span className="text-sm text-foreground">
        {option.nameEn}
        {Number(option.priceAdjustment) ? ` +฿${option.priceAdjustment}` : ""}
      </span>
      <div className="flex items-center gap-2">
        <ToggleButton
          on={!option.soldOut}
          onLabel="Available"
          offLabel="Sold out"
          tone={option.soldOut ? "danger" : "default"}
          onClick={() => update.mutate({ id: option.id, soldOut: !option.soldOut })}
        />
        {confirmingDelete ? (
          <span className="flex items-center gap-1 text-xs">
            <button
              disabled={remove.isPending}
              onClick={() => remove.mutate({ id: option.id })}
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
      </div>
      {remove.error && confirmingDelete && (
        <p className="w-full text-xs text-status-danger">{remove.error.message}</p>
      )}
    </div>
  );
}

function ModifierOptionForm({ groupId }: { groupId: string }) {
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [priceAdjustment, setPriceAdjustment] = useState("0");
  const utils = trpc.useUtils();
  const create = trpc.menu.addModifierOption.useMutation({
    onSuccess: async () => {
      setNameTh("");
      setNameEn("");
      setPriceAdjustment("0");
      await utils.menu.listModifierGroups.invalidate();
      await utils.menu.listForOrdering.invalidate();
    },
  });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-32">
        <TextInput placeholder="English" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </div>
      <div className="w-32">
        <TextInput placeholder="Thai" value={nameTh} onChange={(e) => setNameTh(e.target.value)} />
      </div>
      <div className="w-20">
        <TextInput
          type="number"
          placeholder="+฿"
          value={priceAdjustment}
          onChange={(e) => setPriceAdjustment(e.target.value)}
        />
      </div>
      <Button
        size="md"
        variant="outline"
        disabled={!nameEn || !nameTh || create.isPending}
        onClick={() =>
          create.mutate({ groupId, nameEn, nameTh, priceAdjustment: Number(priceAdjustment) })
        }
      >
        Add option
      </Button>
    </div>
  );
}

function ModifierGroupCard({
  group,
}: {
  group: {
    id: string;
    nameEn: string;
    nameTh: string;
    required: boolean;
    multiSelect: boolean;
    active: boolean;
    options: { id: string; nameEn: string; nameTh: string; priceAdjustment: unknown; active: boolean; soldOut: boolean }[];
  };
}) {
  const utils = trpc.useUtils();
  const [editingName, setEditingName] = useState(false);
  const [nameEn, setNameEn] = useState(group.nameEn);
  const [nameTh, setNameTh] = useState(group.nameTh);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const invalidate = () =>
    Promise.all([utils.menu.listModifierGroups.invalidate(), utils.menu.listForOrdering.invalidate()]);
  const update = trpc.menu.updateModifierGroup.useMutation({
    onSuccess: async () => {
      setEditingName(false);
      await invalidate();
    },
  });
  const remove = trpc.menu.deleteModifierGroup.useMutation({ onSuccess: invalidate });

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1 space-y-1">
          {editingName ? (
            <div className="flex flex-wrap items-center gap-2">
              <TextInput className="w-40" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
              <TextInput className="w-40" value={nameTh} onChange={(e) => setNameTh(e.target.value)} />
              <Button size="md" disabled={update.isPending} onClick={() => update.mutate({ id: group.id, nameEn, nameTh })}>
                Save
              </Button>
              <Button size="md" variant="ghost" onClick={() => setEditingName(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <button onClick={() => setEditingName(true)} className="text-left font-medium text-foreground hover:underline">
              {group.nameEn}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <ToggleButton
            on={group.required}
            onLabel="Required"
            offLabel="Optional"
            onClick={() => update.mutate({ id: group.id, required: !group.required })}
          />
          <ToggleButton
            on={group.multiSelect}
            onLabel="Multi-select"
            offLabel="Single-select"
            onClick={() => update.mutate({ id: group.id, multiSelect: !group.multiSelect })}
          />
          <ToggleButton
            on={group.active}
            onLabel="Active"
            offLabel="Inactive"
            onClick={() => update.mutate({ id: group.id, active: !group.active })}
          />
        </div>
      </div>

      <div className="space-y-1">
        {group.options.map((o) => (
          <ModifierOptionRow key={o.id} option={o} />
        ))}
      </div>
      <ModifierOptionForm groupId={group.id} />

      <div className="border-t border-border pt-2">
        {confirmingDelete ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-status-danger">Delete this group for good?</span>
            <button disabled={remove.isPending} onClick={() => remove.mutate({ id: group.id })} className="font-medium text-status-danger underline">
              Confirm
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="text-foreground-muted underline">
              Cancel
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirmingDelete(true)} className="text-xs text-status-danger underline">
            Delete group
          </button>
        )}
        {remove.error && confirmingDelete && <p className="mt-1 text-xs text-status-danger">{remove.error.message}</p>}
      </div>
    </Card>
  );
}

function CreateModifierGroupForm() {
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [required, setRequired] = useState(false);
  const [multiSelect, setMultiSelect] = useState(false);
  const utils = trpc.useUtils();
  const create = trpc.menu.createModifierGroup.useMutation({
    onSuccess: async () => {
      setNameTh("");
      setNameEn("");
      setRequired(false);
      setMultiSelect(false);
      await utils.menu.listModifierGroups.invalidate();
    },
  });
  return (
    <Card className="flex flex-wrap items-end gap-2">
      <div className="w-40">
        <label className="text-xs text-foreground-muted">English name</label>
        <TextInput value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </div>
      <div className="w-40">
        <label className="text-xs text-foreground-muted">Thai name</label>
        <TextInput value={nameTh} onChange={(e) => setNameTh(e.target.value)} />
      </div>
      <ToggleButton on={required} onLabel="Required" offLabel="Optional" onClick={() => setRequired((r) => !r)} />
      <ToggleButton on={multiSelect} onLabel="Multi-select" offLabel="Single-select" onClick={() => setMultiSelect((m) => !m)} />
      <Button
        size="md"
        disabled={!nameEn || !nameTh || create.isPending}
        onClick={() =>
          create.mutate({
            nameEn,
            nameTh,
            required,
            multiSelect,
            minSelect: required ? 1 : 0,
            maxSelect: multiSelect ? 5 : 1,
          })
        }
      >
        Add modifier group
      </Button>
    </Card>
  );
}

// ------------------------------------------------------------------------

export function MenuManager() {
  const [tab, setTab] = useState<"items" | "modifiers">("items");
  const { data: categories } = trpc.menu.listCategories.useQuery();
  const { data: ordering } = trpc.menu.listForOrdering.useQuery();
  const { data: groups } = trpc.menu.listModifierGroups.useQuery();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const activeCategoryId = selectedCategoryId ?? categories?.[0]?.id ?? null;
  const itemsForCategory =
    ordering?.find((c) => c.id === activeCategoryId)?.items ?? [];

  const reorderCategories = trpc.menu.reorderCategories.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.menu.listCategories.invalidate(),
        utils.menu.listForOrdering.invalidate(),
      ]),
  });
  const categoryDrag = useDragReorder(
    categories ?? [],
    (c) => c.id,
    (orderedIds) => reorderCategories.mutate({ orderedIds }),
  );

  const reorderItems = trpc.menu.reorderItems.useMutation({
    onSuccess: () => utils.menu.listForOrdering.invalidate(),
  });
  const itemDrag = useDragReorder(
    itemsForCategory,
    (i) => i.id,
    (orderedIds) => {
      if (!activeCategoryId) return;
      reorderItems.mutate({ categoryId: activeCategoryId, orderedIds });
    },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTab("items")}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium",
              tab === "items" ? "bg-teal-500/15 text-teal-700 dark:text-teal-300" : "text-foreground-muted",
            )}
          >
            Menu items
          </button>
          <button
            onClick={() => setTab("modifiers")}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium",
              tab === "modifiers" ? "bg-teal-500/15 text-teal-700 dark:text-teal-300" : "text-foreground-muted",
            )}
          >
            Modifier groups
          </button>
        </div>
        {tab === "items" && (
          <ExcelImportButton
            importUrl="/api/menu/import"
            templateUrl="/api/menu/import-template"
            onImported={() =>
              Promise.all([
                utils.menu.listCategories.invalidate(),
                utils.menu.listForOrdering.invalidate(),
              ])
            }
            summaryLabels={[
              { key: "createdCategories", label: "Categories added" },
              { key: "createdItems", label: "Items added" },
              { key: "updatedItems", label: "Items updated" },
            ]}
          />
        )}
      </div>

      {tab === "items" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-2">
            <AddCategoryForm />
            {categories?.map((cat) => (
              <CategoryRow
                key={cat.id}
                category={cat}
                selected={cat.id === activeCategoryId}
                onSelect={() => setSelectedCategoryId(cat.id)}
                handleProps={categoryDrag.getHandleProps(cat.id)}
                rowProps={categoryDrag.getRowProps(cat.id)}
                isDragging={categoryDrag.draggedId === cat.id}
                isDropTarget={categoryDrag.dropTargetId === cat.id}
              />
            ))}
          </div>

          <div className="space-y-3">
            {activeCategoryId ? (
              <Card className="space-y-3">
                <p className="font-medium text-foreground">
                  {categories?.find((c) => c.id === activeCategoryId)?.nameEn}
                </p>
                <div className="space-y-1">
                  {itemsForCategory.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onEdit={() => setEditingItemId(item.id)}
                      handleProps={itemDrag.getHandleProps(item.id)}
                      rowProps={itemDrag.getRowProps(item.id)}
                      isDragging={itemDrag.draggedId === item.id}
                      isDropTarget={itemDrag.dropTargetId === item.id}
                    />
                  ))}
                  {itemsForCategory.length === 0 && (
                    <p className="text-sm text-foreground-muted">No items in this category yet.</p>
                  )}
                </div>
                <QuickAddItemForm categoryId={activeCategoryId} />
              </Card>
            ) : (
              <p className="text-sm text-foreground-muted">Add a category to get started.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <CreateModifierGroupForm />
          {groups?.map((g) => (
            <ModifierGroupCard key={g.id} group={g} />
          ))}
        </div>
      )}

      <Modal open={!!editingItemId} onClose={() => setEditingItemId(null)} wide>
        {editingItemId && (
          <ItemEditor
            itemId={editingItemId}
            categories={categories ?? []}
            onClose={() => setEditingItemId(null)}
          />
        )}
      </Modal>
    </div>
  );
}
