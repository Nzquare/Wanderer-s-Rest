import { router, permissionProcedure, staffProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { getAllSettings, getSettings, updateSettings } from "@/server/settings/service";
import {
  cafeSettingsSchema,
  tablePricingDefaultsSchema,
  membershipSettingsSchema,
  checkoutSettingsSchema,
  notificationSettingsSchema,
  reservationSettingsSchema,
} from "@/server/settings/schema";

const manage = () => permissionProcedure(Permission.MANAGE_SETTINGS);

export const settingsRouter = router({
  getAll: manage().query(() => getAllSettings()),

  /**
   * Read-only — every staff member needs this to know whether/how to
   * alert, not just cashiers. OrderPanel/OrderList (kitchen-ticket chime
   * + auto-print) render on Staff Mobile too, under a role like Tavern
   * Keeper that can't reach Cashier — this used to be cashierProcedure,
   * which 403'd for exactly that role and silently killed both features
   * there with no error surfaced (§Staff Mobile settings access).
   */
  getNotifications: staffProcedure.query(() => getSettings("notifications")),

  /** Read-only — the receipt view (and, same reasoning as
   * getNotifications above, Staff Mobile's own kitchen-ticket printing)
   * needs printerWidthMm to print at the right paper size. */
  getCheckout: staffProcedure.query(() => getSettings("checkout")),

  updateCafe: manage()
    .input(cafeSettingsSchema.partial())
    .mutation(({ input }) => updateSettings("cafe", input)),

  updateTablePricingDefaults: manage()
    .input(tablePricingDefaultsSchema.partial())
    .mutation(({ input }) => updateSettings("tablePricingDefaults", input)),

  updateMembership: manage()
    .input(membershipSettingsSchema.partial())
    .mutation(({ input }) => updateSettings("membership", input)),

  updateCheckout: manage()
    .input(checkoutSettingsSchema.partial())
    .mutation(({ input }) => updateSettings("checkout", input)),

  updateNotifications: manage()
    .input(notificationSettingsSchema.partial())
    .mutation(({ input }) => updateSettings("notifications", input)),

  updateReservations: manage()
    .input(reservationSettingsSchema.partial())
    .mutation(({ input }) => updateSettings("reservations", input)),
});
