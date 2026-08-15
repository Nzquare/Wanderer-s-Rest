"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmojiPicker } from "@/components/ui/emoji-picker";

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-teal-500"
    />
  );
}

type AdventurerClass = {
  id: string;
  nameTh: string;
  nameEn: string;
  icon: string | null;
  active: boolean;
  memberCount: number;
};

function ClassRow({ cls: c }: { cls: AdventurerClass }) {
  const utils = trpc.useUtils();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const invalidate = () => utils.classes.listAll.invalidate();
  const update = trpc.classes.update.useMutation({ onSuccess: invalidate });
  const remove = trpc.classes.remove.useMutation({ onSuccess: invalidate });

  return (
    <Card className="flex flex-wrap items-center gap-3">
      <EmojiPicker value={c.icon ?? "🧙"} onChange={(icon) => update.mutate({ id: c.id, icon })} />
      <div className="min-w-32 flex-1">
        <input
          defaultValue={c.nameEn}
          onBlur={(e) => e.target.value.trim() && e.target.value !== c.nameEn && update.mutate({ id: c.id, nameEn: e.target.value })}
          className="w-full rounded border border-transparent bg-transparent font-medium text-foreground hover:border-border focus:border-teal-500 focus:outline-none"
        />
        <input
          defaultValue={c.nameTh}
          onBlur={(e) => e.target.value.trim() && e.target.value !== c.nameTh && update.mutate({ id: c.id, nameTh: e.target.value })}
          className="w-full rounded border border-transparent bg-transparent text-sm text-foreground-muted hover:border-border focus:border-teal-500 focus:outline-none"
        />
      </div>
      <p className="text-xs text-foreground-muted">
        {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
      </p>
      <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
        <input
          type="checkbox"
          checked={c.active}
          onChange={(e) => update.mutate({ id: c.id, active: e.target.checked })}
        />
        Active
      </label>
      {c.memberCount > 0 ? (
        <span className="text-xs text-foreground-muted" title="Members currently hold this class — mark it inactive instead of deleting.">
          🔒
        </span>
      ) : confirmingDelete ? (
        <span className="flex items-center gap-1.5 text-xs">
          <button disabled={remove.isPending} onClick={() => remove.mutate({ id: c.id })} className="font-medium text-status-danger underline">
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
      {(update.error || remove.error) && (
        <p className="w-full text-xs text-status-danger">{(update.error ?? remove.error)?.message}</p>
      )}
    </Card>
  );
}

function CreateClassForm() {
  const [nameEn, setNameEn] = useState("");
  const [nameTh, setNameTh] = useState("");
  const [icon, setIcon] = useState("🧙");
  const utils = trpc.useUtils();
  const create = trpc.classes.create.useMutation({
    onSuccess: async () => {
      setNameEn("");
      setNameTh("");
      setIcon("🧙");
      await utils.classes.listAll.invalidate();
    },
  });

  const canSubmit = nameEn.trim() && nameTh.trim();

  return (
    <Card className="flex flex-wrap items-end gap-2">
      <EmojiPicker value={icon} onChange={setIcon} />
      <div className="w-40">
        <label className="text-xs text-foreground-muted">English name</label>
        <TextInput value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Alchemist" />
      </div>
      <div className="w-40">
        <label className="text-xs text-foreground-muted">Thai name</label>
        <TextInput value={nameTh} onChange={(e) => setNameTh(e.target.value)} placeholder="นักเล่นแร่แปรธาตุ" />
      </div>
      {create.error && <p className="w-full text-xs text-status-danger">{create.error.message}</p>}
      <Button
        size="md"
        disabled={!canSubmit || create.isPending}
        onClick={() => create.mutate({ nameEn: nameEn.trim(), nameTh: nameTh.trim(), icon })}
      >
        Add class
      </Button>
    </Card>
  );
}

export function ClassesManager() {
  const { data: classes } = trpc.classes.listAll.useQuery();

  return (
    <div className="space-y-4">
      <CreateClassForm />
      <p className="text-xs text-foreground-muted">
        These are the character classes a member can be assigned on their
        profile (§Class emoji) — pick an icon and a name for each. Editing
        a class here changes it for every member who has it. Mark one
        inactive to stop it appearing as an option without losing the
        members currently on it; delete only works once nobody holds it.
      </p>
      <div className="space-y-2">
        {classes?.map((c) => (
          <ClassRow key={c.id} cls={c} />
        ))}
        {classes?.length === 0 && (
          <p className="text-sm text-foreground-muted">No classes yet — add one above.</p>
        )}
      </div>
    </div>
  );
}
