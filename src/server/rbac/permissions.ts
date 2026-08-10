import { Permission } from "@/generated/prisma/enums";

export { Permission };

export const ALL_PERMISSIONS = Object.values(Permission);

/** Human-readable labels for Back Office permission editing UI (§2). */
export const PERMISSION_LABELS: Record<Permission, string> = {
  MANAGE_TABLES: "Manage tables",
  MANAGE_RESERVATIONS: "Manage reservations",
  TAKE_ORDERS: "Take orders",
  MANAGE_TIMERS: "Manage timers",
  APPLY_DISCOUNTS: "Apply discounts",
  VOID_TRANSACTION: "Void transaction",
  REFUND_TRANSACTION: "Refund transaction",
  MANAGE_MENU: "Manage menu",
  MANAGE_GAMES: "Manage games",
  MANAGE_MEMBERS: "Manage members",
  AWARD_ACHIEVEMENTS: "Award manual achievements",
  ADJUST_EXP: "Adjust EXP",
  VIEW_REPORTS: "View reports",
  MANAGE_STAFF: "Manage staff",
  MANAGE_SETTINGS: "Manage settings",
  OPEN_SHIFT: "Open shift",
  CLOSE_SHIFT: "Close shift",
  OVERRIDE_LOCKED_TRANSACTION: "Override locked transaction",
  MANAGE_PROMOTIONS: "Manage promotions",
};

/**
 * Seed defaults for the four initial roles (§2). Owner gets everything.
 * These are only the STARTING permission sets — Back Office can edit any
 * role's permissions afterward, and new custom roles start from a blank set.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  "Owner" | "Manager" | "GM" | "Tavern Keeper",
  Permission[]
> = {
  Owner: ALL_PERMISSIONS,
  Manager: [
    Permission.MANAGE_TABLES,
    Permission.MANAGE_RESERVATIONS,
    Permission.TAKE_ORDERS,
    Permission.MANAGE_TIMERS,
    Permission.APPLY_DISCOUNTS,
    Permission.VOID_TRANSACTION,
    Permission.REFUND_TRANSACTION,
    Permission.MANAGE_MENU,
    Permission.MANAGE_GAMES,
    Permission.MANAGE_MEMBERS,
    Permission.AWARD_ACHIEVEMENTS,
    Permission.ADJUST_EXP,
    Permission.VIEW_REPORTS,
    Permission.MANAGE_STAFF,
    Permission.OPEN_SHIFT,
    Permission.CLOSE_SHIFT,
    Permission.OVERRIDE_LOCKED_TRANSACTION,
    Permission.MANAGE_PROMOTIONS,
  ],
  GM: [
    Permission.MANAGE_TABLES,
    Permission.TAKE_ORDERS,
    Permission.MANAGE_TIMERS,
    Permission.MANAGE_GAMES,
    Permission.MANAGE_MEMBERS,
    Permission.MANAGE_RESERVATIONS,
  ],
  "Tavern Keeper": [
    Permission.MANAGE_TABLES,
    Permission.TAKE_ORDERS,
    Permission.MANAGE_TIMERS,
    Permission.MANAGE_GAMES,
  ],
};
