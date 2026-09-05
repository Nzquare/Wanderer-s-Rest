"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { ReorderHandle } from "@/components/ui/reorder-handle";
import { cn } from "@/lib/cn";
import { useDragReorder, type ReorderHandleProps, type ReorderRowProps } from "@/lib/use-drag-reorder";

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-teal-500"
    />
  );
}

type PaymentMethod = {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  countsAsCash: boolean;
  showQrCode: boolean;
  isBuiltIn: boolean;
  active: boolean;
  inUse: boolean;
};

/**
 * Full edit form in a popup, same reasoning as PricingTypeDetailsModal/
 * RankDetailsModal: the list shows a compact summary row, this is where
 * the toggles and delete happen.
 */
function MethodDetailsModal({
  method: m,
  onClose,
}: {
  method: PaymentMethod;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const invalidate = () =>
    Promise.all([utils.paymentMethods.listAll.invalidate(), utils.paymentMethods.list.invalidate()]);
  const update = trpc.paymentMethods.update.useMutation({ onSuccess: invalidate });
  const remove = trpc.paymentMethods.remove.useMutation({
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <EmojiPicker
            value={m.icon ?? "💳"}
            onChange={(icon) => update.mutate({ id: m.id, icon })}
          />
          <div>
            <input
              defaultValue={m.name}
              onBlur={(e) => e.target.value !== m.name && update.mutate({ id: m.id, name: e.target.value })}
              className="rounded border border-transparent bg-transparent text-lg font-medium text-foreground hover:border-border focus:border-teal-500 focus:outline-none"
            />
            <p className="text-xs text-foreground-muted">
              Code: {m.code}
              {m.isBuiltIn && " · built-in"}
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
          <span>
            Counts as cash
            <span className="block text-xs text-foreground-muted">
              Shows the cash-received/change calculator at checkout, and this method&apos;s
              payments count toward the Shift&apos;s cash-drawer total. Leave off for anything
              settled separately (a delivery platform&apos;s monthly transfer, a card terminal, ...).
            </span>
          </span>
          <input
            type="checkbox"
            checked={m.countsAsCash}
            onChange={(e) => update.mutate({ id: m.id, countsAsCash: e.target.checked })}
            className="h-5 w-5 shrink-0"
          />
        </label>

        <label className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
          <span>
            Show QR code
            <span className="block text-xs text-foreground-muted">
              Shows the PromptPay scan-to-pay QR at checkout when this method is picked.
            </span>
          </span>
          <input
            type="checkbox"
            checked={m.showQrCode}
            onChange={(e) => update.mutate({ id: m.id, showQrCode: e.target.checked })}
            className="h-5 w-5 shrink-0"
          />
        </label>

        <label className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
          <span>
            Active
            <span className="block text-xs text-foreground-muted">
              Only Active methods show up at checkout.
            </span>
          </span>
          <input
            type="checkbox"
            checked={m.active}
            onChange={(e) => update.mutate({ id: m.id, active: e.target.checked })}
            className="h-5 w-5 shrink-0"
          />
        </label>

        <div className="flex items-center justify-between border-t border-border pt-3">
          {m.isBuiltIn ? (
            <p className="text-xs text-foreground-muted">
              Built-in — can&apos;t be deleted. Mark it Inactive instead.
            </p>
          ) : confirmingDelete ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-status-danger">
                {m.inUse ? "Delete anyway? Past payments keep their own record." : "Delete for good?"}
              </span>
              <button
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: m.id, force: m.inUse })}
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

function MethodRow({
  method: m,
  handleProps,
  rowProps,
  isDragging,
  isDropTarget,
}: {
  method: PaymentMethod;
  handleProps: ReorderHandleProps;
  rowProps: ReorderRowProps;
  isDragging: boolean;
  isDropTarget: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card
        {...rowProps}
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 transition-colors",
          !m.active && "opacity-60",
          isDragging && "opacity-40",
          isDropTarget && "border-dashed border-teal-500",
        )}
      >
        <div className="flex items-start gap-2">
          <ReorderHandle handleProps={handleProps} className="mt-0.5" />
          <div>
            <p className="font-medium text-foreground">
              {m.icon ?? "💳"} {m.name}
              {!m.active && <span className="ml-2 text-xs text-foreground-muted">(inactive)</span>}
            </p>
            <p className="text-sm text-foreground-muted">
              {m.countsAsCash && "Counts as cash"}
              {m.countsAsCash && m.showQrCode && " · "}
              {m.showQrCode && "Shows QR"}
              {!m.countsAsCash && !m.showQrCode && "No special checkout behavior"}
              {m.isBuiltIn && " · built-in"}
            </p>
          </div>
        </div>
        <Button size="md" variant="outline" onClick={() => setOpen(true)}>
          Details
        </Button>
      </Card>
      {open && <MethodDetailsModal method={m} onClose={() => setOpen(false)} />}
    </>
  );
}

function CreateMethodForm() {
  const [name, setName] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.paymentMethods.create.useMutation({
    onSuccess: async () => {
      setName("");
      await Promise.all([
        utils.paymentMethods.listAll.invalidate(),
        utils.paymentMethods.list.invalidate(),
      ]);
    },
  });

  return (
    <Card className="flex flex-wrap items-end gap-2">
      <div className="w-56">
        <label className="text-xs text-foreground-muted">Method name</label>
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Line Man, Grab, Bank transfer, ..."
        />
      </div>
      {create.error && <p className="w-full text-xs text-status-danger">{create.error.message}</p>}
      <Button
        size="md"
        disabled={!name.trim() || create.isPending}
        onClick={() => create.mutate({ name: name.trim() })}
      >
        Add method
      </Button>
    </Card>
  );
}

export function PaymentMethodsManager() {
  const utils = trpc.useUtils();
  const { data: methods } = trpc.paymentMethods.listAll.useQuery();
  const reorder = trpc.paymentMethods.reorder.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.paymentMethods.listAll.invalidate(),
        utils.paymentMethods.list.invalidate(),
      ]),
  });
  const { draggedId, dropTargetId, getHandleProps, getRowProps } = useDragReorder(
    methods ?? [],
    (m) => m.id,
    (orderedIds) => reorder.mutate({ orderedIds }),
  );

  return (
    <div className="space-y-4">
      <CreateMethodForm />
      <p className="text-xs text-foreground-muted">
        Cash, PromptPay / QR, Card, and Other are built in and can&apos;t be deleted (rename or
        deactivate instead) — add whatever else the café actually takes payment through, like a
        delivery platform (Line Man, Grab, ...) or a bank transfer. Drag the ⠿ handle to reorder —
        this is also the order the checkout payment picker shows. Open{" "}
        <span className="font-medium text-foreground">Details</span> to rename, set an icon, toggle
        whether it counts as cash or shows the PromptPay QR, or delete a custom one that&apos;s
        never been used.
      </p>
      <div className="space-y-2">
        {methods?.map((m) => (
          <MethodRow
            key={m.id}
            method={m}
            handleProps={getHandleProps(m.id)}
            rowProps={getRowProps(m.id)}
            isDragging={draggedId === m.id}
            isDropTarget={dropTargetId === m.id}
          />
        ))}
        {methods?.length === 0 && (
          <p className="text-sm text-foreground-muted">No payment methods yet.</p>
        )}
      </div>
    </div>
  );
}
