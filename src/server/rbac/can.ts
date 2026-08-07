import { Permission } from "@/generated/prisma/enums";
import type { CurrentStaff } from "@/server/auth/current-user";

export function can(
  staff: Pick<CurrentStaff, "permissions"> | null | undefined,
  permission: Permission,
): boolean {
  if (!staff) return false;
  return staff.permissions.includes(permission);
}

export function canAny(
  staff: Pick<CurrentStaff, "permissions"> | null | undefined,
  permissions: Permission[],
): boolean {
  if (!staff) return false;
  return permissions.some((p) => staff.permissions.includes(p));
}

/**
 * Permission sets used to decide which of the three staff-facing apps a
 * logged-in staff member can reach. Deliberately capability-based (not
 * role-name-based) so a custom role automatically lands in the right
 * place (§2, §50/§51 simplicity rule: only show what's needed).
 */
export const BACK_OFFICE_PERMISSIONS: Permission[] = [
  Permission.MANAGE_SETTINGS,
  Permission.MANAGE_STAFF,
  Permission.MANAGE_MENU,
  Permission.MANAGE_GAMES,
  Permission.MANAGE_MEMBERS,
  Permission.VIEW_REPORTS,
];

export const CASHIER_PERMISSIONS: Permission[] = [
  Permission.OPEN_SHIFT,
  Permission.CLOSE_SHIFT,
  Permission.APPLY_DISCOUNTS,
  Permission.MANAGE_RESERVATIONS,
];

export function canAccessBackOffice(staff: Pick<CurrentStaff, "permissions"> | null) {
  return canAny(staff, BACK_OFFICE_PERMISSIONS);
}

export function canAccessCashier(staff: Pick<CurrentStaff, "permissions"> | null) {
  return canAny(staff, CASHIER_PERMISSIONS);
}

// Staff Mobile is available to every authenticated staff member — it's the
// simplified operational tool everyone learns first.
export function canAccessStaffMobile(staff: Pick<CurrentStaff, "permissions"> | null) {
  return staff !== null;
}
