import { router, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { getAllSettings, updateSettings } from "@/server/settings/service";
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
