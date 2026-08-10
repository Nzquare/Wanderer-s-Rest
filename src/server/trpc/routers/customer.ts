import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { toNum } from "@/lib/decimal";
import { createOrder, cartItemSchema } from "./orders";
import type { PrismaClient } from "@/generated/prisma/client";

const ACTIVE_SESSION_STATUSES = ["OPEN", "PAUSED", "READY_FOR_CHECKOUT"] as const;

async function findTableByToken(prisma: PrismaClient, qrToken: string) {
  const table = await prisma.restaurantTable.findUnique({ where: { qrToken } });
  if (!table || !table.active) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Table not found." });
  }
  return table;
}

/**
 * Fully public — a customer reaches these by scanning a table's QR code,
 * no staff login involved (§16). Every procedure is scoped by the table's
 * unguessable qrToken, and can only ever touch that one table's current
 * session; nothing here can see or affect any other table, membership,
 * pricing, or staff data.
 */
export const customerRouter = router({
  getMenu: publicProcedure
    .input(z.object({ qrToken: z.string() }))
    .query(async ({ ctx, input }) => {
      const table = await findTableByToken(ctx.prisma, input.qrToken);

      if (!table.qrEnabled) {
        return {
          tableName: table.name,
          tableCode: table.code,
          qrEnabled: false,
          hasActiveSession: false,
          categories: [],
        };
      }

      const session = await ctx.prisma.tableSession.findFirst({
        where: { tableId: table.id, status: { in: [...ACTIVE_SESSION_STATUSES] } },
      });

      const categories = await ctx.prisma.menuCategory.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            // Combo/set items need a slot picker the customer QR menu
            // doesn't have yet (§11) — Cashier/Staff can sell them, but
            // hide them here rather than let a customer submit an order
            // that createOrder would reject for missing combo choices.
            where: { active: true, customerVisible: true, staffOnly: false, isCombo: false },
            orderBy: { sortOrder: "asc" },
            include: {
              modifierGroups: {
                orderBy: { sortOrder: "asc" },
                include: {
                  modifierGroup: { include: { options: { orderBy: { sortOrder: "asc" } } } },
                },
              },
            },
          },
        },
      });

      return {
        tableName: table.name,
        tableCode: table.code,
        qrEnabled: true,
        hasActiveSession: !!session,
        categories: categories
          .filter((c) => c.items.length > 0)
          .map((cat) => ({
            id: cat.id,
            nameTh: cat.nameTh,
            nameEn: cat.nameEn,
            items: cat.items.map((item) => ({
              id: item.id,
              nameTh: item.nameTh,
              nameEn: item.nameEn,
              descriptionEn: item.descriptionEn,
              basePrice: toNum(item.basePrice),
              soldOut: item.soldOut,
              photoUrl: item.photoUrl,
              modifierGroups: item.modifierGroups.map((link) => ({
                id: link.modifierGroup.id,
                nameEn: link.modifierGroup.nameEn,
                required: link.modifierGroup.required,
                multiSelect: link.modifierGroup.multiSelect,
                minSelect: link.modifierGroup.minSelect,
                maxSelect: link.modifierGroup.maxSelect,
                options: link.modifierGroup.options
                  .filter((o) => o.active)
                  .map((o) => ({
                    id: o.id,
                    nameEn: o.nameEn,
                    priceAdjustment: toNum(o.priceAdjustment),
                    soldOut: o.soldOut,
                  })),
              })),
            })),
          })),
      };
    }),

  submitOrder: publicProcedure
    .input(
      z.object({
        qrToken: z.string(),
        items: z.array(cartItemSchema).min(1),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const table = await findTableByToken(ctx.prisma, input.qrToken);
      if (!table.qrEnabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ordering isn't available at this table right now.",
        });
      }
      const session = await ctx.prisma.tableSession.findFirst({
        where: { tableId: table.id, status: { in: [...ACTIVE_SESSION_STATUSES] } },
      });
      if (!session) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This table hasn't been opened yet — ask staff to start it first.",
        });
      }

      const order = await createOrder(ctx.prisma, {
        sessionId: session.id,
        source: "CUSTOMER_QR",
        orderedById: null,
        notes: input.notes,
        items: input.items,
      });
      return { orderId: order.id };
    }),

  listMyOrders: publicProcedure
    .input(z.object({ qrToken: z.string() }))
    .query(async ({ ctx, input }) => {
      const table = await findTableByToken(ctx.prisma, input.qrToken);
      const session = await ctx.prisma.tableSession.findFirst({
        where: { tableId: table.id, status: { in: [...ACTIVE_SESSION_STATUSES] } },
      });
      if (!session) return [];

      const orders = await ctx.prisma.order.findMany({
        where: { sessionId: session.id, status: "SUBMITTED" },
        include: { items: { include: { modifiers: true } } },
        orderBy: { createdAt: "desc" },
      });
      return orders.map((o) => ({
        id: o.id,
        source: o.source,
        createdAt: o.createdAt,
        items: o.items.map((i) => ({
          id: i.id,
          nameEn: i.nameSnapshotEn,
          quantity: i.quantity,
          unitPrice: toNum(i.unitPriceSnapshot),
          modifiers: i.modifiers.map((m) => m.nameSnapshotEn),
        })),
      }));
    }),
});
