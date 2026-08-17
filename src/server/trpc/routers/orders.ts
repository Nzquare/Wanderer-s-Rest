import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, permissionProcedure, cashierProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { toNum } from "@/lib/decimal";
import type { Prisma } from "@/generated/prisma/client";

// READY_FOR_CHECKOUT is deliberately excluded — once a table is sent to
// checkout the bill is meant to be locked (§6/§20), for staff and the
// customer's own QR ordering alike. sessions.backToTable reopens a table
// (reverting it to OPEN) specifically for "customer wants to order more".
export const OPEN_ORDER_STATUSES = ["OPEN", "PAUSED"] as const;

export const cartItemSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().max(200).optional(),
  modifierOptionIds: z.array(z.string()).default([]),
  /** One selection per combo slot (§11) — required for every slot on a combo/set item. */
  comboSelections: z
    .array(z.object({ comboSlotId: z.string(), selectedMenuItemId: z.string() }))
    .default([]),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;

/**
 * Shared order-creation path for every source (§14) — Cashier, Staff, and
 * Customer QR all funnel through this so price snapshotting (§45) and
 * availability checks never drift between them.
 */
export async function createOrder(
  prisma: Prisma.TransactionClient,
  params: {
    sessionId: string;
    source: "CASHIER" | "STAFF" | "CUSTOMER_QR";
    orderedById: string | null;
    notes?: string;
    items: CartItemInput[];
  },
) {
  const session = await prisma.tableSession.findUnique({
    where: { id: params.sessionId },
  });
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Table session not found." });
  if (!OPEN_ORDER_STATUSES.includes(session.status as (typeof OPEN_ORDER_STATUSES)[number])) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This table isn't open for new orders.",
    });
  }

  const menuItemIds = params.items.map((i) => i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
  });
  const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

  const allModifierOptionIds = params.items.flatMap((i) => i.modifierOptionIds);
  const modifierOptions = allModifierOptionIds.length
    ? await prisma.modifierOption.findMany({ where: { id: { in: allModifierOptionIds } } })
    : [];
  const modifierOptionMap = new Map(modifierOptions.map((o) => [o.id, o]));

  // Combo slots + the items selected for them (§11) — fetched once for the
  // whole batch, same pattern as modifier options above.
  const comboItemIds = menuItems.filter((m) => m.isCombo).map((m) => m.id);
  const comboSlots = comboItemIds.length
    ? await prisma.comboSlot.findMany({ where: { comboItemId: { in: comboItemIds } } })
    : [];
  const comboSlotMap = new Map(comboSlots.map((s) => [s.id, s]));
  const selectedItemIds = params.items.flatMap((i) =>
    i.comboSelections.map((cs) => cs.selectedMenuItemId),
  );
  const selectedItems = selectedItemIds.length
    ? await prisma.menuItem.findMany({ where: { id: { in: selectedItemIds } } })
    : [];
  const selectedItemMap = new Map(selectedItems.map((m) => [m.id, m]));

  for (const item of params.items) {
    const menuItem = menuItemMap.get(item.menuItemId);
    if (!menuItem || !menuItem.active) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "One of the items is no longer available.",
      });
    }
    if (menuItem.soldOut) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `${menuItem.nameEn} is sold out.` });
    }
    if (menuItem.isCombo) {
      const slotsForItem = comboSlots.filter((s) => s.comboItemId === menuItem.id);
      const selectedSlotIds = new Set(item.comboSelections.map((cs) => cs.comboSlotId));
      const missing = slotsForItem.filter((s) => !selectedSlotIds.has(s.id));
      if (missing.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${menuItem.nameEn} is missing a choice for "${missing[0].nameEn}".`,
        });
      }
      for (const cs of item.comboSelections) {
        const chosen = selectedItemMap.get(cs.selectedMenuItemId);
        if (!chosen || !chosen.active || chosen.soldOut) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `A combo choice for ${menuItem.nameEn} is no longer available.`,
          });
        }
      }
    }
  }

  const order = await prisma.order.create({
    data: {
      sessionId: session.id,
      source: params.source,
      orderedById: params.orderedById,
      notes: params.notes,
      items: {
        create: params.items.map((item) => {
          const menuItem = menuItemMap.get(item.menuItemId)!;
          const comboExtraTotal = item.comboSelections.reduce(
            (sum, cs) => sum + toNum(comboSlotMap.get(cs.comboSlotId)?.extraCharge),
            0,
          );
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
              ) +
              comboExtraTotal,
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
            comboSelections: {
              create: item.comboSelections.map((cs) => {
                const slot = comboSlotMap.get(cs.comboSlotId);
                const chosen = selectedItemMap.get(cs.selectedMenuItemId)!;
                return {
                  comboSlotId: cs.comboSlotId,
                  slotNameSnapshotTh: slot?.nameTh ?? "",
                  slotNameSnapshotEn: slot?.nameEn ?? "",
                  selectedMenuItemId: chosen.id,
                  nameSnapshotTh: chosen.nameTh,
                  nameSnapshotEn: chosen.nameEn,
                  extraChargeSnapshot: toNum(slot?.extraCharge),
                };
              }),
            },
          };
        }),
      },
    },
    include: { items: { include: { modifiers: true, comboSelections: true } } },
  });

  return order;
}

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
      const order = await createOrder(ctx.prisma, {
        ...input,
        orderedById: ctx.staff.id,
      });
      return { orderId: order.id };
    }),

  /**
   * Orders from Staff phones or Customer QR the cashier hasn't seen yet
   * (§17). Full item/modifier/combo detail is included, not just a
   * summary string — this feeds the kitchen ticket print (§Kitchen order
   * printing) as well as the alert banner's own list.
   */
  listUnacknowledged: cashierProcedure.query(async ({ ctx }) => {
    const orders = await ctx.prisma.order.findMany({
      where: {
        acknowledgedAt: null,
        source: { in: ["STAFF", "CUSTOMER_QR"] },
        status: "SUBMITTED",
      },
      include: {
        items: { include: { modifiers: true, comboSelections: true } },
        session: { include: { table: true } },
        orderedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return orders.map((o) => ({
      id: o.id,
      tableCode: o.session.table.code,
      tableId: o.session.tableId,
      source: o.source,
      staffName: o.orderedBy?.name ?? null,
      createdAt: o.createdAt,
      notes: o.notes,
      itemSummary: o.items.map((i) => `${i.quantity}× ${i.nameSnapshotEn}`).join(", "),
      items: o.items.map((i) => ({
        id: i.id,
        nameEn: i.nameSnapshotEn,
        quantity: i.quantity,
        notes: i.notes,
        modifierNames: i.modifiers.map((m) => m.nameSnapshotEn),
        comboSelections: i.comboSelections.map((cs) => ({
          slotNameEn: cs.slotNameSnapshotEn,
          nameEn: cs.nameSnapshotEn,
        })),
      })),
    }));
  }),

  acknowledge: cashierProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.order.update({
        where: { id: input.orderId },
        data: { acknowledgedAt: new Date() },
      });
      return { ok: true };
    }),

  acknowledgeAllForTable: cashierProcedure
    .input(z.object({ tableId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.order.updateMany({
        where: {
          acknowledgedAt: null,
          session: { tableId: input.tableId },
        },
        data: { acknowledgedAt: new Date() },
      });
      return { ok: true };
    }),
});
