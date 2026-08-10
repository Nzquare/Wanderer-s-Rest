"use client";

import { useEffect } from "react";
import { trpc } from "@/lib/trpc/client";

/**
 * "Assign to staff" dropdown for accountability-sensitive actions (void,
 * refund) — the record should reflect whoever is actually responsible,
 * which is picked explicitly here rather than assumed to be whoever is
 * signed in. Defaults to the current user once loaded, but any active
 * staff member can be selected instead (e.g. attributing it to the
 * approving manager).
 */
export function StaffAssignSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (staffId: string) => void;
  className?: string;
}) {
  const { data: staffList } = trpc.staff.listActive.useQuery();
  const { data: me } = trpc.staff.me.useQuery();

  useEffect(() => {
    if (!value && me) onChange(me.id);
    // Only auto-fill once, when nothing's chosen yet — never overwrite a
    // deliberate selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? "h-10 rounded-lg border border-border bg-background px-2 text-sm"}
    >
      <option value="">Assign to…</option>
      {staffList?.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
