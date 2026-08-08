"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-teal-500"
    />
  );
}

function CategoryForm() {
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.menu.createCategory.useMutation({
    onSuccess: async () => {
      setNameTh("");
      setNameEn("");
      await utils.menu.listCategories.invalidate();
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
      <Button
        size="md"
        disabled={!nameEn || !nameTh || create.isPending}
        onClick={() => create.mutate({ nameEn, nameTh })}
      >
        Add category
      </Button>
    </div>
  );
}

function ItemForm({ categoryId }: { categoryId: string }) {
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.menu.createItem.useMutation({
    onSuccess: async () => {
      setNameTh("");
      setNameEn("");
      setBasePrice("");
      setPhotoUrl("");
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
        <TextInput
          type="number"
          value={basePrice}
          onChange={(e) => setBasePrice(e.target.value)}
        />
      </div>
      <div className="w-56">
        <label className="text-xs text-foreground-muted">
          Photo URL (optional)
        </label>
        <TextInput
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          placeholder="https://…"
        />
      </div>
      {create.error && (
        <p className="w-full text-xs text-status-danger">{create.error.message}</p>
      )}
      <Button
        size="md"
        disabled={!nameEn || !nameTh || !basePrice || create.isPending}
        onClick={() =>
          create.mutate({
            categoryId,
            nameEn,
            nameTh,
            basePrice: Number(basePrice),
            photoUrl: photoUrl || undefined,
          })
        }
      >
        Add item
      </Button>
    </div>
  );
}

function ItemPhotoEditor({
  itemId,
  currentPhotoUrl,
}: {
  itemId: string;
  currentPhotoUrl: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentPhotoUrl ?? "");
  const utils = trpc.useUtils();
  const update = trpc.menu.updateItem.useMutation({
    onSuccess: async () => {
      setEditing(false);
      await utils.menu.listForOrdering.invalidate();
    },
  });

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-2 text-xs text-teal-600 hover:underline"
      >
        {currentPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentPhotoUrl}
            alt=""
            className="h-8 w-8 rounded-md object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-background text-foreground-muted">
            📷
          </span>
        )}
        {currentPhotoUrl ? "Change photo" : "Add photo"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <TextInput
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://…"
      />
      <Button
        size="md"
        variant="outline"
        disabled={update.isPending}
        onClick={() => update.mutate({ id: itemId, photoUrl: value })}
      >
        Save
      </Button>
      <Button size="md" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </div>
  );
}

function ModifierGroupForm() {
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [required, setRequired] = useState(false);
  const [multiSelect, setMultiSelect] = useState(false);
  const utils = trpc.useUtils();
  const create = trpc.menu.createModifierGroup.useMutation({
    onSuccess: async () => {
      setNameTh("");
      setNameEn("");
      await utils.menu.listModifierGroups.invalidate();
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
      <label className="flex items-center gap-1 text-xs text-foreground-muted">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        Required
      </label>
      <label className="flex items-center gap-1 text-xs text-foreground-muted">
        <input
          type="checkbox"
          checked={multiSelect}
          onChange={(e) => setMultiSelect(e.target.checked)}
        />
        Multi-select
      </label>
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
        <TextInput
          placeholder="English"
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
        />
      </div>
      <div className="w-32">
        <TextInput
          placeholder="Thai"
          value={nameTh}
          onChange={(e) => setNameTh(e.target.value)}
        />
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
          create.mutate({
            groupId,
            nameEn,
            nameTh,
            priceAdjustment: Number(priceAdjustment),
          })
        }
      >
        Add option
      </Button>
    </div>
  );
}

function AttachModifierForm({ categories }: { categories: { id: string; nameEn: string; items: { id: string; nameEn: string }[] }[] }) {
  const { data: groups } = trpc.menu.listModifierGroups.useQuery();
  const [itemId, setItemId] = useState("");
  const [groupId, setGroupId] = useState("");
  const utils = trpc.useUtils();
  const attach = trpc.menu.attachModifierGroup.useMutation({
    onSuccess: async () => {
      await utils.menu.listForOrdering.invalidate();
    },
  });
  const allItems = categories.flatMap((c) => c.items);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <select
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
        className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
      >
        <option value="">Choose item…</option>
        {allItems.map((i) => (
          <option key={i.id} value={i.id}>
            {i.nameEn}
          </option>
        ))}
      </select>
      <select
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
      >
        <option value="">Choose modifier group…</option>
        {groups?.map((g) => (
          <option key={g.id} value={g.id}>
            {g.nameEn}
          </option>
        ))}
      </select>
      {attach.error && (
        <p className="text-xs text-status-danger">{attach.error.message}</p>
      )}
      <Button
        size="md"
        variant="outline"
        disabled={!itemId || !groupId || attach.isPending}
        onClick={() => attach.mutate({ menuItemId: itemId, modifierGroupId: groupId })}
      >
        Attach to item
      </Button>
    </div>
  );
}

export function MenuManager() {
  const { data: categories } = trpc.menu.listForOrdering.useQuery();
  const { data: groups } = trpc.menu.listModifierGroups.useQuery();
  const utils = trpc.useUtils();
  const toggleSoldOut = trpc.menu.toggleSoldOut.useMutation({
    onSuccess: () => utils.menu.listForOrdering.invalidate(),
  });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Categories</h2>
        <Card>
          <CategoryForm />
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Items</h2>
        {categories?.map((cat) => (
          <Card key={cat.id} className="space-y-3">
            <p className="font-medium text-foreground">{cat.nameEn}</p>
            <div className="space-y-1">
              {cat.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm"
                >
                  <span>
                    {item.nameEn} · ฿{item.basePrice}
                  </span>
                  <div className="flex items-center gap-3">
                    <ItemPhotoEditor
                      itemId={item.id}
                      currentPhotoUrl={item.photoUrl}
                    />
                    <button
                      onClick={() =>
                        toggleSoldOut.mutate({
                          menuItemId: item.id,
                          soldOut: !item.soldOut,
                        })
                      }
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium",
                        item.soldOut
                          ? "bg-status-danger/15 text-status-danger"
                          : "bg-status-success/15 text-status-success",
                      )}
                    >
                      {item.soldOut ? "Sold out" : "Available"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <ItemForm categoryId={cat.id} />
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          Modifier groups
        </h2>
        <Card className="space-y-3">
          <ModifierGroupForm />
        </Card>
        {groups?.map((g) => (
          <Card key={g.id} className="space-y-2">
            <p className="font-medium text-foreground">
              {g.nameEn} {g.required && "· required"}{" "}
              {g.multiSelect && "· multi-select"}
            </p>
            <ul className="text-sm text-foreground-muted">
              {g.options.map((o) => (
                <li key={o.id}>
                  {o.nameEn}
                  {Number(o.priceAdjustment) ? ` +฿${o.priceAdjustment}` : ""}
                </li>
              ))}
            </ul>
            <ModifierOptionForm groupId={g.id} />
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          Attach modifier group to item
        </h2>
        <Card>
          <AttachModifierForm categories={categories ?? []} />
        </Card>
      </section>
    </div>
  );
}
