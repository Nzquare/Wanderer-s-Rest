import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { toNum } from "@/lib/decimal";

const OPEN_ORDER_STATUSES = ["OPEN", "PAUSED", "READY_FOR_CHECKOUT"] as const;

const cartItemSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().max(200).optional(),
  modifierOptionIds: z.array(z.string()).default([]),
});

export const ordersRouter = router({
  add: permissionProcedure(Permission.TAKE_ORDERS)
    .input(
      z.object({
        sessionId: z.string(),
        source: z.enum(["CASHIER", "STAFF"]),
        notes: z.string().max(500).optional(),
        items: z.array(cartItemSchema).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.tableSession.findUnique({
        where: { id: input.sessionId },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (!OPEN_ORDER_STATUSES.includes(session.status as (typeof OPEN_ORDER_STATUSES)[number])) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This table isn't open for new orders.",
        });
      }

      const menuItemIds = input.items.map((i) => i.menuItemId);
      const menuItems = await ctx.prisma.menuItem.findMany({
        where: { id: { in: menuItemIds } },
      });
      const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

      const allModifierOptionIds = input.items.flatMap((i) => i.modifierOptionIds);
      const modifierOptions = allModifierOptionIds.length
        ? await ctx.prisma.modifierOption.findMany({
            where: { id: { in: allModifierOptionIds } },
          })
        : [];
      const modifierOptionMap = new Map(modifierOptions.map((o) => [o.id, o]));

      for (const item of input.items) {
        const menuItem = menuItemMap.get(item.menuItemId);
        if (!menuItem || !menuItem.active) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One of the items is no longer available.",
          });
        }
        if (menuItem.soldOut) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${menuItem.nameEn} is sold out.`,
          });
        }
      }

      const order = await ctx.prisma.order.create({
        data: {
          sessionId: session.id,
          source: input.source,
          orderedById: ctx.staff.id,
          notes: input.notes,
          items: {
            create: input.items.map((item) => {
              const menuItem = menuItemMap.get(item.menuItemId)!;
              return {
                menuItemId: menuItem.id,
                nameSnapshotTh: menuItem.nameTh,
                nameSnapshotEn: menuItem.nameEn,
                quantity: item.quantity,
                unitPriceSnapshot:
                  toNum(menuItem.basePrice) +
                  item.modifierOptionIds.reduce(
                    (sum, id) => sum + toNum(modifierOptionMap.get(id)?.priceAdjustment),
                    0,
                  ),
                notes: item.notes,
                modifiers: {
                  create: item.modifierOptionIds
                    .map((id) => modifierOptionMap.get(id))
                    .filter((o): o is NonNullable<typeof o> => !!o)
                    .map((o) => ({
                      modifierOptionId: o.id,
                      nameSnapshotTh: o.nameTh,
                      nameSnapshotEn: o.nameEn,
                      priceSnapshot: toNum(o.priceAdjustment),
                    })),
                },
              };
            }),
          },
        },
        include: { items: { include: { modifiers: true } } },
      });

      return { orderId: order.id };
    }),
});
