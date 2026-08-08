"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/card";

export function MembersList() {
  const [query, setQuery] = useState("");
  const { data: members, isLoading } = trpc.members.listAll.useQuery({ query });

  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, phone, or member code…"
        className="h-11 w-full max-w-md rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-teal-500"
      />
      {isLoading && <p className="text-sm text-foreground-muted">Loading…</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {members?.map((m) => (
          <Link key={m.id} href={`/back-office/members/${m.id}`}>
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
