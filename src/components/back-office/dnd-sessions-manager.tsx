"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/routers/_app";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StaffAssignSelect } from "@/components/ui/staff-assign-select";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Campaign = RouterOutputs["dnd"]["listCampaigns"][number];
type Bill = RouterOutputs["dnd"]["listUnlinkedBills"][number];

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-teal-500";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Campaigns ──────────────────────────────────────────────────────────

function CampaignsCard() {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const { data: campaigns } = trpc.dnd.listCampaigns.useQuery();
  const invalidate = () => utils.dnd.listCampaigns.invalidate();
  const create = trpc.dnd.createCampaign.useMutation({
    onSuccess: () => {
      setName("");
      invalidate();
    },
  });
  const update = trpc.dnd.updateCampaign.useMutation({ onSuccess: invalidate });
  const remove = trpc.dnd.deleteCampaign.useMutation({ onSuccess: invalidate });

  return (
    <Card className="space-y-3">
      <p className="font-medium text-foreground">Campaigns</p>
      <p className="text-xs text-foreground-muted">
        Several can run at once — each keeps its own session count (Session
        1, 2, 3…), independent of the others. Mark one Inactive once it
        wraps up rather than deleting it, so its past sessions keep their
        history.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-64">
          <label className="text-xs text-foreground-muted">Campaign name</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Curse of Strahd — Tuesdays"
          />
        </div>
        <Button
          size="md"
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate({ name: name.trim() })}
        >
          Add campaign
        </Button>
      </div>
      {create.error && <p className="text-xs text-status-danger">{create.error.message}</p>}
      <div className="space-y-1.5">
        {campaigns?.map((c: Campaign) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center gap-3 rounded-lg bg-background px-3 py-2 text-sm"
          >
            <span className="flex-1 font-medium text-foreground">{c.name}</span>
            <span className="text-xs text-foreground-muted">
              {c._count.sessions} session{c._count.sessions === 1 ? "" : "s"}
            </span>
            <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
              <input
                type="checkbox"
                checked={c.active}
                onChange={(e) => update.mutate({ id: c.id, active: e.target.checked })}
              />
              Active
            </label>
            {c._count.sessions === 0 && (
              <button
                onClick={() => remove.mutate({ id: c.id })}
                className="text-xs text-status-danger underline"
              >
                Delete
              </button>
            )}
          </div>
        ))}
        {campaigns?.length === 0 && (
          <p className="text-sm text-foreground-muted">No campaigns yet — add one above.</p>
        )}
      </div>
      {remove.error && <p className="text-xs text-status-danger">{remove.error.message}</p>}
    </Card>
  );
}

// ─── Log a session ──────────────────────────────────────────────────────

function BillPicker({
  selected,
  onSelect,
}: {
  selected: Bill | null;
  onSelect: (bill: Bill | null) => void;
}) {
  const [query, setQuery] = useState("");
  const { data: bills } = trpc.dnd.listUnlinkedBills.useQuery({ query });

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-teal-500 bg-teal-500/10 px-3 py-2 text-sm">
        <span className="text-foreground">
          {selected.table.name} ({selected.table.code}) ·{" "}
          {selected.endTime ? new Date(selected.endTime).toLocaleString() : "—"} · table fee ฿
          {selected.subtotalTableFee.toFixed(0)}
        </span>
        <button onClick={() => onSelect(null)} className="text-xs text-status-danger underline">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search table by name or code…"
        className={inputCls}
      />
      <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
        {bills?.map((b: Bill) => (
          <button
            key={b.id}
            onClick={() => onSelect(b)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-black/5"
          >
            <span className="text-foreground">
              {b.table.name} ({b.table.code}) ·{" "}
              {b.endTime ? new Date(b.endTime).toLocaleDateString() : "—"}
            </span>
            <span className="text-foreground-muted">฿{b.subtotalTableFee.toFixed(0)}</span>
          </button>
        ))}
        {bills?.length === 0 && (
          <p className="px-2 py-1 text-sm text-foreground-muted">
            No unlinked closed bills match — a table&apos;s bill has to be
            checked out and paid, and not already logged against another
            session, before it can be picked here.
          </p>
        )}
      </div>
    </div>
  );
}

function RecordSessionCard({ campaigns }: { campaigns: Campaign[] }) {
  const utils = trpc.useUtils();
  const { data: dndSettings } = trpc.settings.getAll.useQuery();
  const [type, setType] = useState<"ONE_SHOT" | "CAMPAIGN">("ONE_SHOT");
  const [campaignId, setCampaignId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [bill, setBill] = useState<Bill | null>(null);
  const [notes, setNotes] = useState("");

  const record = trpc.dnd.record.useMutation({
    onSuccess: async () => {
      setBill(null);
      setNotes("");
      setCampaignId("");
      await Promise.all([
        utils.dnd.listSessions.invalidate(),
        utils.dnd.listUnlinkedBills.invalidate(),
        utils.dnd.listCampaigns.invalidate(),
        utils.dnd.commissionSummary.invalidate(),
      ]);
    },
  });

  const commissionPercent = dndSettings?.dnd.commissionPercent ?? 0;
  const preview = bill ? Math.round(bill.subtotalTableFee * commissionPercent) / 100 : null;
  const canSubmit = staffId && bill && (type === "ONE_SHOT" || campaignId);

  return (
    <Card className="space-y-3">
      <p className="font-medium text-foreground">Log a session</p>
      <div className="flex gap-2 rounded-full bg-background p-1">
        {(["ONE_SHOT", "CAMPAIGN"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 rounded-full py-2 text-sm font-medium ${
              type === t ? "bg-teal-500 text-brand-950" : "text-foreground-muted"
            }`}
          >
            {t === "ONE_SHOT" ? "One-shot" : "Campaign"}
          </button>
        ))}
      </div>

      {type === "CAMPAIGN" && (
        <div>
          <label className="text-xs text-foreground-muted">Campaign</label>
          <select
            className={inputCls}
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            <option value="">Pick a campaign…</option>
            {campaigns.filter((c) => c.active).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (next: session {c._count.sessions + 1})
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="text-xs text-foreground-muted">DM (who ran it)</label>
        <StaffAssignSelect value={staffId} onChange={setStaffId} className={inputCls} />
      </div>

      <div>
        <label className="text-xs text-foreground-muted">
          Table bill (commission is {commissionPercent}% of its table fee)
        </label>
        <BillPicker selected={bill} onSelect={setBill} />
      </div>

      {preview != null && (
        <p className="text-sm text-foreground">
          Commission: <span className="font-semibold">฿{preview.toFixed(2)}</span>
        </p>
      )}

      <div>
        <label className="text-xs text-foreground-muted">Notes (optional)</label>
        <input
          className={inputCls}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Party of 4, level 3…"
        />
      </div>

      {record.error && <p className="text-xs text-status-danger">{record.error.message}</p>}
      <Button
        size="md"
        disabled={!canSubmit || record.isPending}
        onClick={() =>
          bill &&
          record.mutate({
            type,
            campaignId: type === "CAMPAIGN" ? campaignId : undefined,
            staffId,
            tableSessionId: bill.id,
            notes: notes.trim() || undefined,
          })
        }
      >
        {record.isPending ? "Logging…" : "Log session"}
      </Button>
    </Card>
  );
}

// ─── Session log ────────────────────────────────────────────────────────

function SessionsLogCard() {
  const utils = trpc.useUtils();
  const { data: sessions } = trpc.dnd.listSessions.useQuery();
  const remove = trpc.dnd.delete.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.dnd.listSessions.invalidate(),
        utils.dnd.listUnlinkedBills.invalidate(),
        utils.dnd.listCampaigns.invalidate(),
        utils.dnd.commissionSummary.invalidate(),
      ]),
  });

  return (
    <Card className="overflow-x-auto p-0">
      <div className="border-b border-border p-4">
        <p className="font-medium text-foreground">Session log</p>
      </div>
      {sessions?.length === 0 ? (
        <p className="p-4 text-sm text-foreground-muted">No sessions logged yet.</p>
      ) : (
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-foreground-muted">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">DM</th>
              <th className="px-3 py-2 font-medium">Run</th>
              <th className="px-3 py-2 font-medium">Table</th>
              <th className="px-3 py-2 text-right font-medium">Table fee</th>
              <th className="px-3 py-2 text-right font-medium">Commission</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sessions?.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-foreground-muted">
                  {new Date(s.playedAt).toLocaleDateString()}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-foreground">
                  {s.staff.displayName ?? s.staff.name}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-foreground-muted">
                  {s.type === "ONE_SHOT"
                    ? "One-shot"
                    : `${s.campaign?.name ?? "Deleted campaign"} — Session ${s.sessionNumber}`}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-foreground-muted">
                  {s.tableSession?.table.code ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-foreground-muted">
                  ฿{s.tableFeeAmount.toFixed(0)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-foreground">
                  ฿{s.commissionAmount.toFixed(2)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button
                    onClick={() => remove.mutate({ id: s.id })}
                    className="text-xs text-status-danger underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// ─── Commission summary ─────────────────────────────────────────────────

function CommissionSummaryCard() {
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const { data, isLoading } = trpc.dnd.commissionSummary.useQuery({ from, to });

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">Commission owed (for payout)</p>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
          />
          <span className="text-foreground-muted">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
          />
        </div>
      </div>
      {isLoading || !data ? (
        <p className="text-sm text-foreground-muted">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-foreground-muted">No sessions logged in range.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-foreground-muted">
              <th className="px-3 py-2 font-medium">DM</th>
              <th className="px-3 py-2 text-right font-medium">Sessions</th>
              <th className="px-3 py-2 text-right font-medium">Total commission</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.staffId} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-foreground">{row.name}</td>
                <td className="px-3 py-2 text-right text-foreground-muted">{row.sessionCount}</td>
                <td className="px-3 py-2 text-right font-semibold text-foreground">
                  ฿{row.totalCommission.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function DndSessionsManager() {
  const { data: campaigns } = trpc.dnd.listCampaigns.useQuery();

  return (
    <div className="space-y-4">
      <CampaignsCard />
      <RecordSessionCard campaigns={campaigns ?? []} />
      <CommissionSummaryCard />
      <SessionsLogCard />
    </div>
  );
}
