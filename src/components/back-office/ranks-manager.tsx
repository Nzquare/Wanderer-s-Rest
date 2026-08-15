"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { cn } from "@/lib/cn";

/**
 * Native HTML5 drag-and-drop reordering for a flat list — same hook as
 * pricing-types-manager.tsx / menu-manager.tsx's category rail. Grabbing
 * the handle on any row and dropping it on another moves it there;
 * `onReorder` gets the full new id order (ranks.reorder takes exactly
 * that shape). Order here is the actual rank ladder — reorders change
 * which rank a member's level resolves into (§Rank management).
 */
function useDragReorder<T>(items: T[], getId: (item: T) => string, onReorder: (orderedIds: string[]) => void) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function getHandleProps(id: string) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        setDraggedId(id);
      },
      onDragEnd: () => {
        setDraggedId(null);
        setDropTargetId(null);
      },
    };
  }

  function getRowProps(id: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        if (draggedId && draggedId !== id) setDropTargetId(id);
      },
      onDragLeave: () => {
        setDropTargetId((current) => (current === id ? null : current));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDropTargetId(null);
        if (!draggedId || draggedId === id) return;
        const ids = items.map(getId);
        const fromIndex = ids.indexOf(draggedId);
        const toIndex = ids.indexOf(id);
        if (fromIndex === -1 || toIndex === -1) return;
        const reordered = [...ids];
        reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, draggedId);
        setDraggedId(null);
        onReorder(reordered);
      },
    };
  }

  return { draggedId, dropTargetId, getHandleProps, getRowProps };
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-teal-500"
    />
  );
}

type Rank = {
  id: string;
  nameTh: string;
  nameEn: string;
  icon: string | null;
  descriptionTh: string | null;
  descriptionEn: string | null;
  levelsRequired: number;
  memberCount: number;
};

/**
 * Full edit form, in a popup rather than inline — same reasoning as
 * PricingTypeDetailsModal: a long ladder with every field expanded on
 * every row is unusable, so the list shows a compact summary and this
 * modal is where the fine-tuning (descriptions, delete) happens.
 */
function RankDetailsModal({ rank: r, onClose }: { rank: Rank; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const invalidate = () =>
    Promise.all([utils.ranks.listAll.invalidate(), utils.ranks.list.invalidate()]);
  const update = trpc.ranks.update.useMutation({ onSuccess: invalidate });
  const remove = trpc.ranks.remove.useMutation({
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <EmojiPicker
              value={r.icon ?? "🎖️"}
              onChange={(icon) => update.mutate({ id: r.id, icon })}
            />
            <div>
              <input
                defaultValue={r.nameEn}
                onBlur={(e) => e.target.value !== r.nameEn && update.mutate({ id: r.id, nameEn: e.target.value })}
                className="rounded border border-transparent bg-transparent text-lg font-medium text-foreground hover:border-border focus:border-teal-500 focus:outline-none"
              />
              <p className="text-sm text-foreground-muted">
                {r.levelsRequired} levels · {r.memberCount} member{r.memberCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-foreground-muted">Thai name</label>
            <TextInput
              defaultValue={r.nameTh}
              onBlur={(e) => e.target.value !== r.nameTh && update.mutate({ id: r.id, nameTh: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">Levels required</label>
            <TextInput
              type="number"
              min={1}
              defaultValue={r.levelsRequired}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (n > 0 && n !== r.levelsRequired) update.mutate({ id: r.id, levelsRequired: n });
              }}
            />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">English description (optional)</label>
            <TextInput
              defaultValue={r.descriptionEn ?? ""}
              onBlur={(e) => update.mutate({ id: r.id, descriptionEn: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">Thai description (optional)</label>
            <TextInput
              defaultValue={r.descriptionTh ?? ""}
              onBlur={(e) => update.mutate({ id: r.id, descriptionTh: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          {r.memberCount > 0 ? (
            <p className="text-xs text-foreground-muted">
              {r.memberCount} member{r.memberCount === 1 ? "" : "s"} currently hold this rank — can&apos;t
              delete it. Move them to a different rank first (Adjust Rank on their profile).
            </p>
          ) : confirmingDelete ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-status-danger">Delete for good?</span>
              <button
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: r.id })}
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

function RankRow({
  rank: r,
  handleProps,
  rowProps,
  isDragging,
  isDropTarget,
}: {
  rank: Rank;
  handleProps: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  rowProps: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
  };
  isDragging: boolean;
  isDropTarget: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card
        onDragOver={rowProps.onDragOver}
        onDragLeave={rowProps.onDragLeave}
        onDrop={rowProps.onDrop}
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 transition-colors",
          isDragging && "opacity-40",
          isDropTarget && "border-dashed border-teal-500",
        )}
      >
        <div className="flex items-start gap-2">
          <span
            {...handleProps}
            title="Drag to reorder"
            className="mt-0.5 cursor-grab select-none text-foreground-muted active:cursor-grabbing"
          >
            ⠿
          </span>
          <div>
            <p className="font-medium text-foreground">
              {r.icon ?? "🎖️"} {r.nameEn}{" "}
              <span className="text-xs text-foreground-muted">({r.nameTh})</span>
            </p>
            <p className="text-sm text-foreground-muted">
              {r.levelsRequired} levels · {r.memberCount} member{r.memberCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <Button size="md" variant="outline" onClick={() => setOpen(true)}>
          Details
        </Button>
      </Card>
      {open && <RankDetailsModal rank={r} onClose={() => setOpen(false)} />}
    </>
  );
}

function CreateRankForm() {
  const [nameEn, setNameEn] = useState("");
  const [nameTh, setNameTh] = useState("");
  const [levelsRequired, setLevelsRequired] = useState("20");
  const utils = trpc.useUtils();
  const create = trpc.ranks.create.useMutation({
    onSuccess: async () => {
      setNameEn("");
      setNameTh("");
      setLevelsRequired("20");
      await Promise.all([utils.ranks.listAll.invalidate(), utils.ranks.list.invalidate()]);
    },
  });

  const canSubmit = nameEn && nameTh && Number(levelsRequired) > 0;

  return (
    <Card className="flex flex-wrap items-end gap-2">
      <div className="w-40">
        <label className="text-xs text-foreground-muted">English name</label>
        <TextInput value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Elite" />
      </div>
      <div className="w-40">
        <label className="text-xs text-foreground-muted">Thai name</label>
        <TextInput value={nameTh} onChange={(e) => setNameTh(e.target.value)} placeholder="ยอดฝีมือ" />
      </div>
      <div className="w-28">
        <label className="text-xs text-foreground-muted">Levels required</label>
        <TextInput
          type="number"
          min={1}
          value={levelsRequired}
          onChange={(e) => setLevelsRequired(e.target.value)}
        />
      </div>
      {create.error && <p className="w-full text-xs text-status-danger">{create.error.message}</p>}
      <Button
        size="md"
        disabled={!canSubmit || create.isPending}
        onClick={() =>
          create.mutate({ nameEn, nameTh, levelsRequired: Number(levelsRequired) })
        }
      >
        Add rank
      </Button>
    </Card>
  );
}

export function RanksManager() {
  const utils = trpc.useUtils();
  const { data: ranks } = trpc.ranks.listAll.useQuery();
  const reorder = trpc.ranks.reorder.useMutation({
    onSuccess: () => Promise.all([utils.ranks.listAll.invalidate(), utils.ranks.list.invalidate()]),
  });
  const { draggedId, dropTargetId, getHandleProps, getRowProps } = useDragReorder(
    ranks ?? [],
    (r) => r.id,
    (orderedIds) => reorder.mutate({ orderedIds }),
  );

  return (
    <div className="space-y-4">
      <CreateRankForm />
      <p className="text-xs text-foreground-muted">
        This is the actual rank ladder members climb as they level up — top
        of the list is the lowest rank, bottom is the highest. Each rank
        spans however many levels you set (&quot;Levels required&quot;)
        before the next one kicks in; the last rank absorbs every level
        beyond it, so a maxed-out member keeps leveling instead of getting
        stuck. Drag the ⠿ handle to reorder. Open{" "}
        <span className="font-medium text-foreground">Details</span> to
        rename, add a description, or delete a rank nobody currently holds.
        To move a specific member to a different rank, use{" "}
        <span className="font-medium text-foreground">Adjust Rank</span> on
        their profile instead — editing a rank here changes it for everyone
        in it.
      </p>
      <div className="space-y-2">
        {ranks?.map((r) => (
          <RankRow
            key={r.id}
            rank={r}
            handleProps={getHandleProps(r.id)}
            rowProps={getRowProps(r.id)}
            isDragging={draggedId === r.id}
            isDropTarget={dropTargetId === r.id}
          />
        ))}
        {ranks?.length === 0 && (
          <p className="text-sm text-foreground-muted">No ranks yet — add one above.</p>
        )}
      </div>
    </div>
  );
}
