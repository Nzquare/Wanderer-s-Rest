import "server-only";
import { cache } from "react";
import { prisma } from "@/server/db";
import { readSessionCookie, verifySessionToken } from "./session";
import type { Permission } from "@/generated/prisma/enums";

export interface CurrentStaff {
  id: string;
  name: string;
  displayName: string | null;
  loginId: string;
  roleId: string;
  roleName: string;
  permissions: Permission[];
}

/**
 * Resolves the logged-in staff member (with live permissions) for the
 * current request. Cached per-request so every page/layout/tRPC procedure
 * that needs it only pays for one DB round trip.
 */
export const getCurrentStaff = cache(
  async (): Promise<CurrentStaff | null> => {
    const token = await readSessionCookie();
    if (!token) return null;
    const session = await verifySessionToken(token);
    if (!session) return null;

    const staff = await prisma.staff.findUnique({
      where: { id: session.staffId, status: "ACTIVE" },
      include: { role: { include: { permissions: true } } },
    });
    if (!staff) return null;

    return {
      id: staff.id,
      name: staff.name,
      displayName: staff.displayName,
      loginId: staff.loginId,
      roleId: staff.roleId,
      roleName: staff.role.name,
      permissions: staff.role.permissions.map((p) => p.permission),
    };
  },
);
