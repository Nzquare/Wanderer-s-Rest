import { z } from "zod";

// Central definition of every configurable value from spec §44.
// Each section is a Zod schema with sane defaults; the DB (Setting table)
// only stores overrides layered on top of these via src/server/settings/service.ts.
// Business logic (pricing/exp/etc.) must always read through that service —
// never hard-code a number that appears here.

export const cafeSettingsSchema = z.object({
  nameTh: z.string().default("โรงเตี๊ยมวันเดอเรอร์"),
  nameEn: z.string().default("Wanderer's Rest"),
  logoUrl: z.string().nullable().default(null),
  address: z.string().default(""),
  phone: z.string().default(""),
  openingHours: z.string().default("11:00–22:00"),
  currency: z.string().default("THB"),
  currencySymbol: z.string().default("฿"),
  defaultLanguage: z.enum(["th", "en"]).default("th"),
});
export type CafeSettings = z.infer<typeof cafeSettingsSchema>;

export const membershipSettingsSchema = z.object({
  bahtPerExp: z.number().default(10),
  expPerLevel: z.number().default(100),
  levelsPerRank: z.number().default(20),
});
export type MembershipSettings = z.infer<typeof membershipSettingsSchema>;

export const checkoutSettingsSchema = z.object({
  taxEnabled: z.boolean().default(false),
  taxPercent: z.number().default(7),
  serviceChargeEnabled: z.boolean().default(false),
  serviceChargePercent: z.number().default(10),
  receiptFooterTh: z.string().default("ขอบคุณที่มาเยือน Wanderer's Rest!"),
  receiptFooterEn: z.string().default("Thank you for visiting Wanderer's Rest!"),
  printerWidthMm: z.union([z.literal(58), z.literal(80)]).default(80),
  /** Phone number, 13-digit national/tax ID, or e-Wallet ID registered for PromptPay (§20) — used to generate the scan-to-pay QR at checkout. Blank = QR not shown. */
  promptpayId: z.string().default(""),
});
export type CheckoutSettings = z.infer<typeof checkoutSettingsSchema>;

export const notificationSettingsSchema = z.object({
  cashierSoundEnabled: z.boolean().default(true),
  volume: z.number().min(0).max(1).default(0.8),
  notifyOnCustomerOrder: z.boolean().default(true),
  notifyOnStaffOrder: z.boolean().default(true),
  /** Auto-open the print dialog for a kitchen ticket the moment a new
   * Staff/Customer-QR order arrives (§Kitchen order printing) — still
   * respects notifyOnCustomerOrder/notifyOnStaffOrder for *which* sources
   * trigger it. A manual print button on each order stays available
   * regardless, for reprints or when this is off. */
  autoPrintKitchenTicket: z.boolean().default(true),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const settingsSchemas = {
  cafe: cafeSettingsSchema,
  membership: membershipSettingsSchema,
  checkout: checkoutSettingsSchema,
  notifications: notificationSettingsSchema,
} as const;

export type SettingsKey = keyof typeof settingsSchemas;
