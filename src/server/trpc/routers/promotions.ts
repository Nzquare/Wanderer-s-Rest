import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";
import { router, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { toNum, toNumOrNull } from "@/lib/decimal";
import { logAudit } from "@/server/audit";

/** Prisma's nullable Json columns want Prisma.JsonNull to clear, not a bare `null`. */
function jsonOrNull<T>(v: T[] | null | undefined) {
  if (v === undefined) return undefined;
  return v === null ? Prisma.JsonNull : v;
}

const manage = () => permissionProcedure(Permission.MANAGE_PROMOTIONS);

/**
 * V1 keeps promotion types to the three checkout understands how to apply:
 * PERCENTAGE / FIXED_AMOUNT (off the whole bill, same pair manual discounts
 * use) and FREE_ITEM (redeems one specific menu item the guest actually
 * ordered — see checkout.ts's toPromotionConfig, which resolves the
 * discount live from that item's current price). The schema/domain layer
 * supports a few more (MENU_ITEM_DISCOUNT, TABLE_FEE_DISCOUNT, ...) but
 * those need item/table-fee-level targeting checkout doesn't compute yet;
 * adding them here would create promotions the bill can't actually apply.
 */
const typeEnum = z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_ITEM"]);

/** Base shape shared by create (fully validated) and update (partial, no cross-field checks — see below). */
const promotionShape = z.object({
  name: z.string().min(1),
  type: typeEnum,
  // FREE_ITEM ignores this (the discount is resolved live from the
  // reward item's price) — 0 is fine there; PERCENTAGE/FIXED_AMOUNT need
  // a real positive value.
  value: z.number().min(0),
  rewardMenuItemId: z.string().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  activeDays: z.array(z.number().int().min(0).max(6)).optional().nullable(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  minimumSpend: z.number().min(0).optional().nullable(),
  memberOnly: z.boolean().default(false),
  stackable: z.boolean().default(false),
});

// Create requires the full shape, so the FREE_ITEM/value cross-field checks
// can run against a complete picture. Update takes a partial patch (e.g.
// just `{ id, active }` to toggle a promotion) where those checks don't
// make sense against a partial object — the `create` mutation is the only
// place a promotion's type is first chosen anyway.
const promotionInput = promotionShape
  .refine((v) => v.type !== "FREE_ITEM" || !!v.rewardMenuItemId, {
    message: "Pick a menu item for this promotion to give away for free.",
    path: ["rewardMenuItemId"],
  })
  .refine((v) => v.type === "FREE_ITEM" || v.value > 0, {
    message: "Value must be greater than 0.",
    path: ["value"],
  });

function serialize(p: {
  id: string;
  name: string;
  type: string;
  value: unknown;
  rewardMenuItemId: string | null;
  rewardMenuItem: { nameEn: string; basePrice: unknown } | null;
  startDate: Date | null;
  endDate: Date | null;
  activeDays: unknown;
  startTime: string | null;
  endTime: string | null;
  minimumSpend: unknown;
  memberOnly: boolean;
  stackable: boolean;
  active: boolean;
}) {
  return {
    id: p.id,
    name: p.name,
    // V1 promotions are only ever created as one of these three (see
    // typeEnum above) — narrowing here just reflects that at the type level.
    type: p.type as "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_ITEM",
    value: toNum(p.value),
    rewardMenuItemId: p.rewardMenuItemId,
    rewardMenuItemName: p.rewardMenuItem?.nameEn ?? null,
    rewardMenuItemPrice: p.rewardMenuItem ? toNum(p.rewardMenuItem.basePrice) : null,
    startDate: p.startDate,
    endDate: p.endDate,
    activeDays: (p.activeDays as number[] | null) ?? null,
    startTime: p.startTime,
    endTime: p.endTime,
    minimumSpend: toNumOrNull(p.minimumSpend),
    memberOnly: p.memberOnly,
    stackable: p.stackable,
    active: p.active,
  };
}

export const promotionsRouter = router({
  listAll: manage().query(async ({ ctx }) => {
    const promotions = await ctx.prisma.promotion.findMany({
      orderBy: { createdAt: "desc" },
      include: { rewardMenuItem: { select: { nameEn: true, basePrice: true } } },
    });
    return promotions.map(serialize);
  }),

  create: manage()
    .input(promotionInput)
    .mutation(async ({ ctx, input }) => {
      const { startDate, endDate, activeDays, ...rest } = input;
      const promotion = await ctx.prisma.promotion.create({
        data: {
          ...rest,
          activeDays: jsonOrNull(activeDays),
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
        },
        include: { rewardMenuItem: { select: { nameEn: true, basePrice: true } } },
      });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "PROMOTION_CREATED",
        entityType: "Promotion",
        entityId: promotion.id,
        newValue: { name: promotion.name, type: promotion.type, value: toNum(promotion.value) },
      });
      return serialize(promotion);
    }),

  update: manage()
    .input(promotionShape.partial().extend({ id: z.string(), active: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, startDate, endDate, activeDays, ...rest } = input;
      const promotion = await ctx.prisma.promotion.update({
        where: { id },
        data: {
          ...rest,
          activeDays: jsonOrNull(activeDays),
          ...(startDate !== undefined
            ? { startDate: startDate ? new Date(startDate) : null }
            : {}),
          ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
        },
        include: { rewardMenuItem: { select: { nameEn: true, basePrice: true } } },
      });
      return serialize(promotion);
    }),

  /**
   * True delete — only for a promotion that's never actually been applied
   * to a bill. One that has stays forever via AppliedDiscount history
   * (§45) and gets deactivated instead, same pattern as menu/tables.
   */
  remove: manage()
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const promotion = await ctx.prisma.promotion.findUnique({
        where: { id: input.id },
        include: { _count: { select: { appliedDiscounts: true } } },
      });
      if (!promotion) throw new TRPCError({ code: "NOT_FOUND" });
      if (promotion._count.appliedDiscounts > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${promotion.name}" has already been applied to a bill and can't be deleted — mark it Inactive instead.`,
        });
      }
      await ctx.prisma.promotion.delete({ where: { id: input.id } });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "PROMOTION_DELETED",
        entityType: "Promotion",
        entityId: input.id,
        previousValue: { name: promotion.name },
      });
      return { ok: true };
    }),
});
