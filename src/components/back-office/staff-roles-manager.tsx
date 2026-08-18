"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleButton } from "@/components/ui/toggle-button";
import { PERMISSION_LABELS } from "@/server/rbac/permissions";
import type { Permission } from "@/generated/prisma/enums";

function CreateStaffForm({ roles }: { roles: { id: string; name: string }[] }) {
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  // Roles load asynchronously after this form's first render, so rather
  // than a useState seeded from an empty `roles` prop (which would never
  // pick up the real list once it arrives), fall back to the first loaded
  // role at render time. selectedRoleId only wins once the user actually
  // touches the dropdown.
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const roleId = selectedRoleId || roles[0]?.id || "";
  const utils = trpc.useUtils();
  const create = trpc.staff.create.useMutation({
    onSuccess: async () => {
      setName("");
      setLoginId("");
      setPin("");
      setSelectedRoleId("");
      await utils.staff.list.invalidate();
    },
  });

  return (
    <Card className="flex flex-wrap items-end gap-2">
      <div className="w-36">
        <label className="text-xs text-foreground-muted">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
      </div>
      <div className="w-32">
        <label className="text-xs text-foreground-muted">Login ID</label>
        <input
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          placeholder="e.g. nij"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
      </div>
      <div className="w-24">
        <label className="text-xs text-foreground-muted">PIN</label>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="4+ digits"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
      </div>
      <div className="w-40">
        <label className="text-xs text-foreground-muted">Role</label>
        <select
          value={roleId}
          onChange={(e) => setSelectedRoleId(e.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      {create.error && (
        <p className="w-full text-xs text-status-danger">{create.error.message}</p>
      )}
      <Button
        size="md"
        disabled={!name || !loginId || pin.length < 4 || !roleId || create.isPending}
        onClick={() => create.mutate({ name, loginId, pin, roleId })}
      >
        Add staff
      </Button>
    </Card>
  );
}

function StaffRow({
  member,
  roles,
}: {
  member: {
    id: string;
    name: string;
    loginId: string;
    status: "ACTIVE" | "INACTIVE";
    role: { id: string; name: string };
  };
  roles: { id: string; name: string }[];
}) {
  const utils = trpc.useUtils();
  const [newPin, setNewPin] = useState("");
  const [showPinReset, setShowPinReset] = useState(false);
  const setStatus = trpc.staff.setStatus.useMutation({
    onSuccess: () => utils.staff.list.invalidate(),
  });
  const setRole = trpc.staff.setRole.useMutation({
    onSuccess: () => utils.staff.list.invalidate(),
  });
  const resetPin = trpc.staff.resetPin.useMutation({
    onSuccess: () => {
      setShowPinReset(false);
      setNewPin("");
    },
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm">
      <div>
        <p className="font-medium text-foreground">
          {member.name} <span className="text-foreground-muted">· {member.loginId}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={member.role.id}
          onChange={(e) => setRole.mutate({ staffId: member.id, roleId: e.target.value })}
          className="h-9 rounded-lg border border-border bg-surface px-2 text-xs"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <ToggleButton
          on={member.status === "ACTIVE"}
          onLabel="Active"
          offLabel="Inactive"
          onClick={() =>
            setStatus.mutate({
              staffId: member.id,
              status: member.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
            })
          }
        />
        {showPinReset ? (
          <div className="flex items-center gap-1">
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="New PIN"
              className="h-9 w-24 rounded-lg border border-border bg-surface px-2 text-xs"
            />
            <Button
              size="md"
              variant="outline"
              disabled={newPin.length < 4 || resetPin.isPending}
              onClick={() => resetPin.mutate({ staffId: member.id, newPin })}
            >
              Save
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setShowPinReset(true)}
            className="text-xs text-teal-600 underline"
          >
            Reset PIN
          </button>
        )}
      </div>
    </div>
  );
}

function RoleEditor({
  role,
  allPermissions,
}: {
  role: { id: string; name: string; permissions: { permission: Permission }[] };
  allPermissions: Permission[];
}) {
  const [selected, setSelected] = useState<Set<Permission>>(
    new Set(role.permissions.map((p) => p.permission)),
  );
  const [dirty, setDirty] = useState(false);
  const utils = trpc.useUtils();
  const save = trpc.staff.updateRolePermissions.useMutation({
    onSuccess: async () => {
      setDirty(false);
      await utils.staff.listRoles.invalidate();
    },
  });

  function toggle(p: Permission) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
    setDirty(true);
  }

  return (
    <Card className="space-y-2">
      <p className="font-medium text-foreground">{role.name}</p>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {allPermissions.map((p) => (
          <label key={p} className="flex items-center gap-2 text-xs text-foreground-muted">
            <input
              type="checkbox"
              checked={selected.has(p)}
              onChange={() => toggle(p)}
            />
            {PERMISSION_LABELS[p]}
          </label>
        ))}
      </div>
      {dirty && (
        <Button
          size="md"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({ roleId: role.id, permissions: Array.from(selected) })
          }
        >
          Save permissions
        </Button>
      )}
    </Card>
  );
}

function CreateRoleForm() {
  const [name, setName] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.staff.createRole.useMutation({
    onSuccess: async () => {
      setName("");
      await utils.staff.listRoles.invalidate();
    },
  });
  return (
    <Card className="flex items-end gap-2">
      <div className="w-48">
        <label className="text-xs text-foreground-muted">New role name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Bar Lead"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
      </div>
      {create.error && (
        <p className="text-xs text-status-danger">{create.error.message}</p>
      )}
      <Button
        size="md"
        variant="outline"
        disabled={!name || create.isPending}
        onClick={() => create.mutate({ name })}
      >
        Add role
      </Button>
    </Card>
  );
}

export function StaffRolesManager() {
  const { data: staffList, error: staffError } = trpc.staff.list.useQuery();
  const { data: roles, error: rolesError } = trpc.staff.listRoles.useQuery();
  const { data: allPermissions } = trpc.staff.allPermissions.useQuery();

  // A FORBIDDEN here (no MANAGE_STAFF) used to just fall through to
  // `roles ?? []` on every list — an apparently-working but silently empty
  // page (create form with nothing to pick from, no staff/roles listed, no
  // explanation) rather than a page that ever says why (§Back Office
  // permission-error visibility).
  const error = staffError ?? rolesError;
  if (error) {
    return <p className="text-sm text-status-danger">{error.message}</p>;
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Staff</h2>
        <CreateStaffForm roles={roles ?? []} />
        <div className="space-y-1">
          {staffList?.map((s) => (
            <StaffRow key={s.id} member={s} roles={roles ?? []} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Roles & permissions</h2>
        <CreateRoleForm />
        {roles?.map((role) => (
          <RoleEditor key={role.id} role={role} allPermissions={allPermissions ?? []} />
        ))}
      </section>
    </div>
  );
}
