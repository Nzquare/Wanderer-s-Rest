"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PERMISSION_LABELS } from "@/server/rbac/permissions";
import type { Permission } from "@/generated/prisma/enums";

function RoleEditor({
  role,
  allPermissions,
}: {
  role: {
    id: string;
    name: string;
    isSystem: boolean;
    permissions: { permission: Permission }[];
    denyBackOfficeAccess: boolean;
    denyCashierAccess: boolean;
    _count: { staff: number };
  };
  allPermissions: Permission[];
}) {
  const [selected, setSelected] = useState<Set<Permission>>(
    new Set(role.permissions.map((p) => p.permission)),
  );
  const [dirty, setDirty] = useState(false);
  const [allowBackOffice, setAllowBackOffice] = useState(!role.denyBackOfficeAccess);
  const [allowCashier, setAllowCashier] = useState(!role.denyCashierAccess);
  const [appAccessDirty, setAppAccessDirty] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const utils = trpc.useUtils();
  const invalidate = () => utils.staff.listRoles.invalidate();
  const save = trpc.staff.updateRolePermissions.useMutation({
    onSuccess: async () => {
      setDirty(false);
      await invalidate();
    },
  });
  const saveAppAccess = trpc.staff.updateAppAccess.useMutation({
    onSuccess: async () => {
      setAppAccessDirty(false);
      await invalidate();
    },
  });
  const remove = trpc.staff.deleteRole.useMutation({ onSuccess: invalidate });
  const rename = trpc.staff.updateRole.useMutation({ onSuccess: invalidate });

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
      <div className="flex items-center justify-between gap-2">
        <input
          defaultValue={role.name}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value && value !== role.name) rename.mutate({ roleId: role.id, name: value });
          }}
          className="rounded border border-transparent bg-transparent font-medium text-foreground hover:border-border focus:border-teal-500 focus:outline-none"
        />
        {role.isSystem ? (
          <span
            className="text-xs text-foreground-muted"
            title="Built-in roles (Owner, Manager, GM, Tavern Keeper) can't be deleted."
          >
            🔒
          </span>
        ) : role._count.staff > 0 ? (
          <span
            className="text-xs text-foreground-muted"
            title={`${role._count.staff} staff member(s) still have this role — reassign them first.`}
          >
            🔒
          </span>
        ) : confirmingDelete ? (
          <span className="flex items-center gap-1.5 text-xs">
            <button
              disabled={remove.isPending}
              onClick={() => remove.mutate({ roleId: role.id })}
              className="font-medium text-status-danger underline"
            >
              Confirm
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="text-foreground-muted underline">
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="text-xs text-status-danger underline"
          >
            Delete
          </button>
        )}
      </div>
      {(remove.error || rename.error) && (
        <p className="text-xs text-status-danger">{(remove.error ?? rename.error)?.message}</p>
      )}
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

      <div className="space-y-2 border-t border-border pt-2">
        <p className="text-xs font-medium text-foreground-muted">
          App access — overrides the permissions above. Staff Mobile is
          always reachable; some permissions here (Manage games, Manage
          members, Manage reservations, ...) are also needed for actions
          on Staff Mobile, so unchecking a box below is the only way to
          keep those while still locking this role out of that app.
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-foreground-muted">
            <input
              type="checkbox"
              checked={allowBackOffice}
              onChange={(e) => {
                setAllowBackOffice(e.target.checked);
                setAppAccessDirty(true);
              }}
            />
            Allow Back Office access
          </label>
          <label className="flex items-center gap-2 text-xs text-foreground-muted">
            <input
              type="checkbox"
              checked={allowCashier}
              onChange={(e) => {
                setAllowCashier(e.target.checked);
                setAppAccessDirty(true);
              }}
            />
            Allow Cashier POS access
          </label>
        </div>
        {appAccessDirty && (
          <Button
            size="md"
            disabled={saveAppAccess.isPending}
            onClick={() =>
              saveAppAccess.mutate({
                roleId: role.id,
                denyBackOfficeAccess: !allowBackOffice,
                denyCashierAccess: !allowCashier,
              })
            }
          >
            Save app access
          </Button>
        )}
      </div>
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

export function RolesManager() {
  const { data: roles, error: rolesError } = trpc.staff.listRoles.useQuery();
  const { data: allPermissions } = trpc.staff.allPermissions.useQuery();

  // Same reasoning as StaffManager (§Back Office permission-error
  // visibility) — a FORBIDDEN here should say so, not just render an
  // empty page with no create form and no roles listed.
  if (rolesError) {
    return <p className="text-sm text-status-danger">{rolesError.message}</p>;
  }

  return (
    <div className="space-y-3">
      <CreateRoleForm />
      {roles?.map((role) => (
        <RoleEditor key={role.id} role={role} allPermissions={allPermissions ?? []} />
      ))}
    </div>
  );
}
