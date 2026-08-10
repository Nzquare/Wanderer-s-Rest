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
 * V1 keeps promotion types to the two checkout already understands
 * (PERCENTAGE / FIXED_AMOUNT) — the same pair manual discounts use. The
 * schema/domain layer supports more (MENU_ITEM_DISCOUNT, FREE_ITEM, etc.)
 * but those need item-level targeting checkout doesn't compute yet; adding
 * them here would create promotions the bill can't actually apply.
 */
const typeEnum = z.enum(["PERCENTAGE", "FIXED_AMOUNT"]);

const promotionInput = z.object({
  name: z.string().min(1),
  type: typeEnum,
  value: z.number().positive(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  activeDays: z.array(z.number().int().min(0).max(6)).optional().nullable(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  eligiblePricingTypeIds: z.array(z.string()).optional().nullable(),
  minimumSpend: z.number().min(0).optional().nullable(),
  memberOnly: z.boolean().default(false),
  stackable: z.boolean().default(false),
});

function serialize(p: {
  id: string;
  name: string;
  type: string;
  value: unknown;
  startDate: Date | null;
  endDate: Date | null;
  activeDays: unknown;
  startTime: string | null;
  endTime: string | null;
  eligiblePricingTypeIds: unknown;
  minimumSpend: unknown;
  memberOnly: boolean;
  stackable: boolean;
  active: boolean;
}) {
  return {
    id: p.id,
    name: p.name,
    // V1 promotions are only ever created as PERCENTAGE/FIXED_AMOUNT (see
    // typeEnum above) — narrowing here just reflects that at the type level.
    type: p.type as "PERCENTAGE" | "FIXED_AMOUNT",
    value: toNum(p.value),
    startDate: p.startDate,
    endDate: p.endDate,
    activeDays: (p.activeDays as number[] | null) ?? null,
    startTime: p.startTime,
    endTime: p.endTime,
    eligiblePricingTypeIds: (p.eligiblePricingTypeIds as string[] | null) ?? null,
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
    });
    return promotions.map(serialize);
  }),

  create: manage()
    .input(promotionInput)
    .mutation(async ({ ctx, input }) => {
      const { startDate, endDate, activeDays, eligiblePricingTypeIds, ...rest } = input;
      const promotion = await ctx.prisma.promotion.create({
        data: {
          ...rest,
          activeDays: jsonOrNull(activeDays),
          eligiblePricingTypeIds: jsonOrNull(eligiblePricingTypeIds),
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
        },
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
    .input(promotionInput.partial().extend({ id: z.string(), active: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, startDate, endDate, activeDays, eligiblePricingTypeIds, ...rest } = input;
      const promotion = await ctx.prisma.promotion.update({
        where: { id },
        data: {
          ...rest,
          activeDays: jsonOrNull(activeDays),
          eligiblePricingTypeIds: jsonOrNull(eligiblePricingTypeIds),
          ...(startDate !== undefined
            ? { startDate: startDate ? new Date(startDate) : null }
            : {}),
          ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
        },
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
