"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StaffAssignSelect } from "@/components/ui/staff-assign-select";

export function ClockPanel() {
  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");
  const utils = trpc.useUtils();
  const { data: openEntries } = trpc.timeClock.listOpen.useQuery(undefined, {
    refetchInterval: 15_000,
  });

  const invalidate = () => utils.timeClock.listOpen.invalidate();
  const clockIn = trpc.timeClock.clockIn.useMutation({
    onSuccess: () => {
      setPin("");
      invalidate();
    },
  });
  const clockOut = trpc.timeClock.clockOut.useMutation({
    onSuccess: () => {
      setPin("");
      invalidate();
    },
  });

  const isOpen = openEntries?.some((e) => e.staffId === staffId) ?? false;
  const error = clockIn.error ?? clockOut.error;

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="font-medium text-foreground">Clock in or out</p>
        <p className="text-xs text-foreground-muted">
          Pick your name and enter your own PIN — this doesn&apos;t change
          who&apos;s signed into this terminal, it just logs your own hours.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-48">
            <label className="text-xs text-foreground-muted">Staff</label>
            <StaffAssignSelect
              value={staffId}
              onChange={setStaffId}
              className="h-11 w-full rounded-lg border border-border bg-background px-2 text-sm"
            />
          </div>
          <div className="w-32">
            <label className="text-xs text-foreground-muted">PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
            />
          </div>
        </div>
        {error && <p className="text-sm text-status-danger">{error.message}</p>}
        {clockIn.isSuccess && !clockIn.isPending && (
          <p className="text-sm text-status-success">Clocked in — have a good shift!</p>
        )}
        {clockOut.isSuccess && !clockOut.isPending && (
          <p className="text-sm text-status-success">Clocked out — see you next time!</p>
        )}
        <div className="flex gap-2">
          <Button
            size="lg"
            disabled={!staffId || !pin || isOpen || clockIn.isPending}
            onClick={() => clockIn.mutate({ staffId, pin })}
          >
            Clock In
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={!staffId || !pin || !isOpen || clockOut.isPending}
            onClick={() => clockOut.mutate({ staffId, pin })}
          >
            Clock Out
          </Button>
        </div>
      </Card>

      <Card className="space-y-2">
        <p className="font-medium text-foreground">Currently clocked in</p>
        {openEntries?.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nobody&apos;s on the clock right now.</p>
        ) : (
          <div className="space-y-1">
            {openEntries?.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">{e.staffNameSnapshot}</span>
                <span className="text-foreground-muted">
                  Since{" "}
                  {new Date(e.clockIn).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
