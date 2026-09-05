import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { logAudit } from "@/server/audit";

// Payment methods are financial/business configuration in the same
// spirit as pricing types/ranks — gated behind MANAGE_SETTINGS rather
// than a dedicated new Permission enum value (see pricing-types.ts's
// identical reasoning).
const manage = () => permissionProcedure(Permission.MANAGE_SETTINGS);

const paymentMethodShape = z.object({
  name: z.string().min(1).max(40),
  icon: z.string().max(8).optional().nullable(),
  countsAsCash: z.boolean().default(false),
  showQrCode: z.boolean().default(false),
});

function serialize(m: {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  countsAsCash: boolean;
  showQrCode: boolean;
  isBuiltIn: boolean;
  active: boolean;
  sortOrder: number;
  _count?: { payments: number };
}) {
  return {
    id: m.id,
    code: m.code,
    name: m.name,
    icon: m.icon,
    countsAsCash: m.countsAsCash,
    showQrCode: m.showQrCode,
    isBuiltIn: m.isBuiltIn,
    active: m.active,
    sortOrder: m.sortOrder,
    inUse: m._count ? m._count.payments > 0 : false,
  };
}

export const paymentMethodsRouter = router({
  /** Active-only, for the checkout payment picker. */
  list: staffProcedure.query(async ({ ctx }) => {
    const methods = await ctx.prisma.paymentMethod.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
    return methods.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      icon: m.icon,
      countsAsCash: m.countsAsCash,
      showQrCode: m.showQrCode,
    }));
  }),

  /** Every payment method, active or not — the Back Office management list. */
  listAll: manage().query(async ({ ctx }) => {
    const methods = await ctx.prisma.paymentMethod.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { payments: true } } },
    });
    return methods.map(serialize);
  }),

  /**
   * A custom method's code is derived from its name (uppercased,
   * non-alphanumerics squashed to underscores) rather than asked for
   * separately — unlike PricingType, there's no cashier-facing shorthand
   * that needs to stay short/typeable, `code` here just needs to be a
   * stable, unique key.
   */
  create: manage()
    .input(paymentMethodShape)
    .mutation(async ({ ctx, input }) => {
      const base = input.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      let code = base || "METHOD";
      let suffix = 2;
      while (await ctx.prisma.paymentMethod.findUnique({ where: { code } })) {
        code = `${base}_${suffix++}`;
      }
      const last = await ctx.prisma.paymentMethod.findFirst({ orderBy: { sortOrder: "desc" } });
      const created = await ctx.prisma.paymentMethod.create({
        data: { ...input, code, sortOrder: (last?.sortOrder ?? -1) + 1 },
      });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "PAYMENT_METHOD_CREATED",
        entityType: "PaymentMethod",
        entityId: created.id,
        newValue: { code: created.code, name: created.name },
      });
      return serialize({ ...created, _count: { payments: 0 } });
    }),

  update: manage()
    .input(paymentMethodShape.partial().extend({ id: z.string(), active: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const updated = await ctx.prisma.paymentMethod.update({
        where: { id },
        data: rest,
        include: { _count: { select: { payments: true } } },
      });
      return serialize(updated);
    }),

  /**
   * Drag-and-drop reorder, same shape as pricingTypes.reorder/
   * ranks.reorder — every id in its new top-to-bottom order, renumbered
   * to match. This order is also what the checkout payment picker shows.
   */
  reorder: manage()
    .input(z.object({ orderedIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const methods = await ctx.prisma.paymentMethod.findMany({
        where: { id: { in: input.orderedIds } },
      });
      const byId = new Map(methods.map((m) => [m.id, m]));
      const updates = input.orderedIds
        .map((id, index) => ({ existing: byId.get(id), sortOrder: index }))
        .filter(
          (row): row is { existing: NonNullable<typeof row.existing>; sortOrder: number } =>
            !!row.existing && row.existing.sortOrder !== row.sortOrder,
        )
        .map((row) =>
          ctx.prisma.paymentMethod.update({
            where: { id: row.existing.id },
            data: { sortOrder: row.sortOrder },
          }),
        );
      await ctx.prisma.$transaction(updates);
      return { ok: true };
    }),

  /**
   * Cash/PromptPay/Card/Other (isBuiltIn) are a hard, never-forceable
   * block — checkout/shift logic assumes at least a cash and a QR option
   * always exist. A custom method blocks softly (CONFLICT) once it has
   * payment history, same force-delete pattern as Promotions — old
   * payments already keep their own methodNameSnapshot (§45), so the FK
   * going SET NULL doesn't lose anything they display.
   */
  remove: manage()
    .input(z.object({ id: z.string(), force: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const method = await ctx.prisma.paymentMethod.findUnique({
        where: { id: input.id },
        include: { _count: { select: { payments: true } } },
      });
      if (!method) throw new TRPCError({ code: "NOT_FOUND" });
      if (method.isBuiltIn) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${method.name}" is a built-in payment method and can't be deleted — rename it or mark it Inactive instead.`,
        });
      }
      if (method._count.payments > 0 && !input.force) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `"${method.name}" has already been used for a payment and can't be deleted — mark it Inactive instead, or delete it anyway if you're sure.`,
        });
      }
      await ctx.prisma.paymentMethod.delete({ where: { id: input.id } });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "PAYMENT_METHOD_DELETED",
        entityType: "PaymentMethod",
        entityId: input.id,
        previousValue: { code: method.code, name: method.name, hadPaymentHistory: method._count.payments > 0 },
      });
      return { ok: true };
    }),
});
