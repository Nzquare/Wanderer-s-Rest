import { router, permissionProcedure, cashierProcedure } from "../trpc";
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

  /** Read-only — every cashier needs this to know whether/how to alert, not just Owner/Manager. */
  getNotifications: cashierProcedure.query(() => getSettings("notifications")),

  /** Read-only — the receipt view needs printerWidthMm to print at the right paper size. */
  getCheckout: cashierProcedure.query(() => getSettings("checkout")),

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
