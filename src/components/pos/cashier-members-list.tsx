"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function CreateMemberForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adventurerName, setAdventurerName] = useState("");
  const [phone, setPhone] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.members.quickCreate.useMutation({
    onSuccess: async (member) => {
      setAdventurerName("");
      setPhone("");
      setOpen(false);
      await utils.members.browse.invalidate();
      router.push(`/cashier/members/${member.id}`);
    },
  });

  if (!open) {
    return (
      <Button size="md" onClick={() => setOpen(true)}>
        + Add member
      </Button>
    );
  }

  return (
    <Card className="flex flex-wrap items-end gap-2">
      <div className="w-56">
        <label className="text-xs text-foreground-muted">Adventurer name</label>
        <input
          value={adventurerName}
          onChange={(e) => setAdventurerName(e.target.value)}
          placeholder="e.g. DragonSlayer99"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
      </div>
      <div className="w-48">
        <label className="text-xs text-foreground-muted">Phone (optional)</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. 0812345678"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
      </div>
      {create.error && <p className="w-full text-xs text-status-danger">{create.error.message}</p>}
      <Button
        size="md"
        disabled={!adventurerName.trim() || create.isPending}
        onClick={() =>
          create.mutate({ adventurerName: adventurerName.trim(), phone: phone.trim() || undefined })
        }
      >
        {create.isPending ? "Creating…" : "Create member"}
      </Button>
      <Button size="md" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </Card>
  );
}

/**
 * The Cashier POS "Members" tab — a lighter directory than Back Office's
 * (§Cashier member linking): any staff can search/browse and register a
 * new member here without needing MANAGE_MEMBERS, via members.browse
 * (staffProcedure, no staffNotes/lineUserId in the row). Full profile
 * editing on the page this links to is still permission-gated per action.
 */
export function CashierMembersList() {
  const [query, setQuery] = useState("");
  const { data: members, isLoading } = trpc.members.browse.useQuery({ query });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, or member code…"
          className="h-11 flex-1 min-w-56 max-w-md rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-teal-500"
        />
      </div>
      <CreateMemberForm />
      {isLoading && <p className="text-sm text-foreground-muted">Loading…</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {members?.map((m) => (
          <Link key={m.id} href={`/cashier/members/${m.id}`}>
            <Card className="flex items-center justify-between transition-transform hover:scale-[1.02]">
              <div>
                <p className="font-medium text-foreground">{m.adventurerName}</p>
                <p className="text-xs text-foreground-muted">
                  {m.rank?.nameEn ?? "Unranked"} · {m.class?.nameEn ?? "No class"}
                </p>
              </div>
              <span className="text-sm font-semibold text-teal-600">
                {m.lifetimeExp} EXP
              </span>
            </Card>
          </Link>
        ))}
        {members?.length === 0 && (
          <p className="text-sm text-foreground-muted">No members found.</p>
        )}
      </div>
    </div>
  );
}
