"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

/**
 * Search-and-link (or quick-register-and-link) a member to a table
 * session — shared between the table page and Checkout so a customer can
 * be linked either while they're playing or right up until payment
 * (§Cashier member linking). Invalidation is the caller's job via
 * `onChanged` rather than hardcoded here, since the two call sites read
 * the linked member through different queries (getTableDetail vs
 * checkout.getPreview).
 */
export function MemberLinkPanel({
  sessionId,
  member,
  onChanged,
}: {
  sessionId: string;
  member: { id: string; adventurerName: string } | null;
  onChanged: () => unknown;
}) {
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const search = trpc.members.search.useQuery(
    { query },
    { enabled: query.trim().length > 0 },
  );

  const link = trpc.sessions.linkMember.useMutation({ onSuccess: onChanged });
  const unlink = trpc.sessions.unlinkMember.useMutation({
    onSuccess: onChanged,
  });
  const quickCreate = trpc.members.quickCreate.useMutation({
    onSuccess: async (created) => {
      await link.mutateAsync({ sessionId, memberId: created.id });
      setShowCreate(false);
      setNewName("");
      setNewPhone("");
      setQuery("");
    },
  });

  if (member) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-3">
        <div>
          <p className="text-xs text-foreground-muted">Linked member</p>
          <p className="font-medium text-foreground">{member.adventurerName}</p>
          <Link
            href={`/back-office/members/${member.id}`}
            className="text-xs text-teal-600 underline"
          >
            View profile
          </Link>
        </div>
        <Button
          variant="outline"
          size="md"
          onClick={() => unlink.mutate({ sessionId })}
          disabled={unlink.isPending}
        >
          Unlink
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-foreground-muted">Link a member</p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name or phone…"
        className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-teal-500"
      />
      {query.trim() && (
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {search.data?.map((m) => (
            <button
              key={m.id}
              onClick={() => link.mutate({ sessionId, memberId: m.id })}
              className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-black/5"
            >
              <span>{m.adventurerName}</span>
              <span className="text-foreground-muted">{m.phone ?? m.memberCode}</span>
            </button>
          ))}
          {search.data?.length === 0 && (
            <button
              onClick={() => {
                setShowCreate(true);
                setNewName(query);
              }}
              className="w-full rounded-lg px-2 py-2 text-left text-sm text-teal-600 hover:bg-black/5"
            >
              No match — register &quot;{query}&quot; as a new member
            </button>
          )}
        </div>
      )}

      {showCreate && (
        <div className="space-y-2 border-t border-border pt-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Adventurer name"
            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-teal-500"
          />
          <input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-teal-500"
          />
          <Button
            size="md"
            className="w-full"
            disabled={!newName.trim() || quickCreate.isPending}
            onClick={() =>
              quickCreate.mutate({ adventurerName: newName, phone: newPhone })
            }
          >
            Create & Link
          </Button>
        </div>
      )}
    </div>
  );
}
