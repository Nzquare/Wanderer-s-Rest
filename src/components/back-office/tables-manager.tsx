"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleButton } from "@/components/ui/toggle-button";
import { QrCodeImage } from "./qr-code-image";

function CreateTableForm() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [area, setArea] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.tables.create.useMutation({
    onSuccess: async () => {
      setCode("");
      setName("");
      setCapacity("4");
      setArea("");
      await utils.tables.listAll.invalidate();
      await utils.sessions.listTables.invalidate();
    },
  });

  return (
    <Card className="flex flex-wrap items-end gap-2">
      <div className="w-24">
        <label className="text-xs text-foreground-muted">Code</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="T7"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
      </div>
      <div className="w-40">
        <label className="text-xs text-foreground-muted">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Table 7"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
      </div>
      <div className="w-20">
        <label className="text-xs text-foreground-muted">Seats</label>
        <input
          type="number"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
      </div>
      <div className="w-32">
        <label className="text-xs text-foreground-muted">Area</label>
        <input
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder="Main Hall"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
      </div>
      {create.error && (
        <p className="w-full text-xs text-status-danger">{create.error.message}</p>
      )}
      <Button
        size="md"
        disabled={!code || !name || !capacity || create.isPending}
        onClick={() =>
          create.mutate({ code, name, capacity: Number(capacity), area: area || undefined })
        }
      >
        Add table
      </Button>
    </Card>
  );
}

type TableListItem = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  area: string | null;
  active: boolean;
  qrEnabled: boolean;
  qrToken: string;
};

function EditTableForm({
  table,
  onDone,
}: {
  table: TableListItem;
  onDone: () => void;
}) {
  const [name, setName] = useState(table.name);
  const [capacity, setCapacity] = useState(String(table.capacity));
  const [area, setArea] = useState(table.area ?? "");
  const utils = trpc.useUtils();
  const update = trpc.tables.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.tables.listAll.invalidate(),
        utils.sessions.listTables.invalidate(),
      ]);
      onDone();
    },
  });

  return (
    <div className="space-y-2 rounded-lg border border-teal-500 bg-background p-3">
      <div className="flex flex-wrap gap-2">
        <div className="w-40">
          <label className="text-xs text-foreground-muted">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
          />
        </div>
        <div className="w-20">
          <label className="text-xs text-foreground-muted">Seats</label>
          <input
            type="number"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
          />
        </div>
        <div className="w-32">
          <label className="text-xs text-foreground-muted">Area</label>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="Main Hall"
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
          />
        </div>
      </div>
      {update.error && <p className="text-xs text-status-danger">{update.error.message}</p>}
      <div className="flex gap-2">
        <Button
          size="md"
          disabled={!name.trim() || !capacity || update.isPending}
          onClick={() =>
            update.mutate({
              id: table.id,
              name: name.trim(),
              capacity: Number(capacity),
              area: area.trim() || undefined,
            })
          }
        >
          Save
        </Button>
        <Button size="md" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function TablesManager() {
  const { data: tables } = trpc.tables.listAll.useQuery();
  const utils = trpc.useUtils();
  const update = trpc.tables.update.useMutation({
    onSuccess: () => {
      utils.tables.listAll.invalidate();
      utils.sessions.listTables.invalidate();
    },
  });
  const remove = trpc.tables.remove.useMutation({
    onSuccess: () => {
      setConfirmingDeleteId(null);
      utils.tables.listAll.invalidate();
      utils.sessions.listTables.invalidate();
    },
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  // Only read on the client; the QR block that uses this is hidden until a
  // table is expanded, so there's nothing to mismatch during hydration.
  const [origin] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : "",
  );

  return (
    <div className="space-y-4">
      <CreateTableForm />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tables?.map((table) =>
          editingId === table.id ? (
            <EditTableForm key={table.id} table={table} onDone={() => setEditingId(null)} />
          ) : (
            <Card key={table.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">
                    {table.code} · {table.name}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {table.capacity} seats · {table.area ?? "—"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <ToggleButton
                    on={table.active}
                    onLabel="Active"
                    offLabel="Removed"
                    onClick={() => update.mutate({ id: table.id, active: !table.active })}
                  />
                  <ToggleButton
                    on={table.qrEnabled}
                    onLabel="QR on"
                    offLabel="QR off"
                    onClick={() => update.mutate({ id: table.id, qrEnabled: !table.qrEnabled })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditingId(table.id)}
                    className="text-xs text-teal-600 underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setExpanded(expanded === table.id ? null : table.id)}
                    className="text-xs text-teal-600 underline"
                  >
                    {expanded === table.id ? "Hide QR code" : "Show QR code"}
                  </button>
                </div>
                {confirmingDeleteId === table.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-status-danger">Delete for good?</span>
                    <button
                      onClick={() => remove.mutate({ id: table.id })}
                      disabled={remove.isPending}
                      className="text-xs font-medium text-status-danger underline"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(null)}
                      className="text-xs text-foreground-muted underline"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingDeleteId(table.id)}
                    className="text-xs text-status-danger underline"
                  >
                    Delete
                  </button>
                )}
              </div>
              {remove.error && confirmingDeleteId === table.id && (
                <p className="text-xs text-status-danger">{remove.error.message}</p>
              )}
              {expanded === table.id && origin && (
                <div className="flex items-center gap-3 rounded-lg bg-background p-3">
                  <QrCodeImage value={`${origin}/t/${table.qrToken}`} size={120} />
                  <div className="text-xs text-foreground-muted break-all">
                    {origin}/t/{table.qrToken}
                  </div>
                </div>
              )}
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
