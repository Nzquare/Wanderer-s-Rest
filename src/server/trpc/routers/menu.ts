import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { toNum } from "@/lib/decimal";
import { logAudit } from "@/server/audit";

/**
 * A `photoUrl` is either a real http(s) URL (legacy/rare) or a client-side
 * resized `data:image/...;base64,...` JPEG (the normal "upload a photo"
 * path — see src/lib/image-resize.ts). Plain `z.string().url()` also
 * accepts `data:` URLs per the WHATWG URL parser, but we're explicit here
 * since that's not obvious at a glance.
 */
const photoUrlSchema = z
  .string()
  .refine(
    (v) => v === "" || v.startsWith("http://") || v.startsWith("https://") || v.startsWith("data:image/"),
    "Not a valid photo",
  )
  .optional();

/** Foreign-key violation (option/group still referenced by historical orders). */
function isFkViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003";
}

/** Menu structure for the ordering UI: Category -> Item -> Modifier Group -> Option (§10-13). */
export const menuRouter = router({
  listForOrdering: staffProcedure.query(async ({ ctx }) => {
    const categories = await ctx.prisma.menuCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          where: { active: true },
          orderBy: { sortOrder: "asc" },
          include: {
            modifierGroups: {
              orderBy: { sortOrder: "asc" },
              include: {
                modifierGroup: {
                  include: {
                    options: { orderBy: { sortOrder: "asc" } },
                  },
                },
              },
            },
          },
        },
      },
    });

    return categories.map((cat) => ({
      id: cat.id,
      nameTh: cat.nameTh,
      nameEn: cat.nameEn,
      items: cat.items.map((item) => ({
        id: item.id,
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        basePrice: toNum(item.basePrice),
        soldOut: item.soldOut,
        photoUrl: item.photoUrl,
        modifierGroups: item.modifierGroups.map((link) => ({
          id: link.modifierGroup.id,
          nameTh: link.modifierGroup.nameTh,
          nameEn: link.modifierGroup.nameEn,
          required: link.modifierGroup.required,
          multiSelect: link.modifierGroup.multiSelect,
          minSelect: link.modifierGroup.minSelect,
          maxSelect: link.modifierGroup.maxSelect,
          options: link.modifierGroup.options
            .filter((o) => o.active)
            .map((o) => ({
              id: o.id,
              nameTh: o.nameTh,
              nameEn: o.nameEn,
              priceAdjustment: toNum(o.priceAdjustment),
              soldOut: o.soldOut,
            })),
        })),
      })),
    }));
  }),

  toggleSoldOut: permissionProcedure(Permission.MANAGE_MENU)
    .input(z.object({ menuItemId: z.string(), soldOut: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.menuItem.update({
        where: { id: input.menuItemId },
        data: { soldOut: input.soldOut },
      });
      return { ok: true };
    }),

  // --- Categories -----------------------------------------------------

  listCategories: staffProcedure.query(async ({ ctx }) => {
    return ctx.prisma.menuCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { items: true } } },
    });
  }),

  createCategory: permissionProcedure(Permission.MANAGE_MENU)
    .input(z.object({ nameTh: z.string().min(1), nameEn: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const last = await ctx.prisma.menuCategory.findFirst({
        orderBy: { sortOrder: "desc" },
      });
      return ctx.prisma.menuCategory.create({
        data: { ...input, sortOrder: (last?.sortOrder ?? -1) + 1 },
      });
    }),

  updateCategory: permissionProcedure(Permission.MANAGE_MENU)
    .input(
      z.object({
        id: z.string(),
        nameTh: z.string().min(1).optional(),
        nameEn: z.string().min(1).optional(),
        active: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.menuCategory.update({ where: { id }, data });
    }),

  /**
   * True delete — only for a category with no items left in it (move or
   * delete them first). A category that's ever had items ordered from it
   * stays around via its items' history regardless, so this guard is
   * really just "don't silently orphan items" rather than a historical-data
   * concern by itself.
   */
  deleteCategory: permissionProcedure(Permission.MANAGE_MENU)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const category = await ctx.prisma.menuCategory.findUnique({
        where: { id: input.id },
        include: { _count: { select: { items: true } } },
      });
      if (!category) throw new TRPCError({ code: "NOT_FOUND" });
      if (category._count.items > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${category.nameEn}" still has ${category._count.items} item(s) — move or delete them first, or mark the category Inactive instead.`,
        });
      }
      await ctx.prisma.menuCategory.delete({ where: { id: input.id } });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "MENU_CATEGORY_DELETED",
        entityType: "MenuCategory",
        entityId: input.id,
        previousValue: { nameEn: category.nameEn },
      });
      return { ok: true };
    }),

  // --- Items ------------------------------------------------------------

  /** Full item detail for the edit drawer, including its modifier group links. */
  getItem: staffProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.prisma.menuItem.findUnique({
        where: { id: input.id },
        include: {
          modifierGroups: {
            orderBy: { sortOrder: "asc" },
            include: { modifierGroup: true },
          },
        },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        ...item,
        basePrice: toNum(item.basePrice),
      };
    }),

  createItem: permissionProcedure(Permission.MANAGE_MENU)
    .input(
      z.object({
        categoryId: z.string(),
        nameTh: z.string().min(1),
        nameEn: z.string().min(1),
        basePrice: z.number().min(0),
        descriptionTh: z.string().optional(),
        descriptionEn: z.string().optional(),
        photoUrl: photoUrlSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { photoUrl, ...rest } = input;
      const last = await ctx.prisma.menuItem.findFirst({
        where: { categoryId: input.categoryId },
        orderBy: { sortOrder: "desc" },
      });
      return ctx.prisma.menuItem.create({
        data: { ...rest, photoUrl: photoUrl || null, sortOrder: (last?.sortOrder ?? -1) + 1 },
      });
    }),

  updateItem: permissionProcedure(Permission.MANAGE_MENU)
    .input(
      z.object({
        id: z.string(),
        categoryId: z.string().optional(),
        nameTh: z.string().min(1).optional(),
        nameEn: z.string().min(1).optional(),
        descriptionTh: z.string().optional(),
        descriptionEn: z.string().optional(),
        basePrice: z.number().min(0).optional(),
        active: z.boolean().optional(),
        soldOut: z.boolean().optional(),
        featured: z.boolean().optional(),
        seasonal: z.boolean().optional(),
        isNew: z.boolean().optional(),
        staffOnly: z.boolean().optional(),
        customerVisible: z.boolean().optional(),
        discountEligible: z.boolean().optional(),
        notes: z.string().optional(),
        photoUrl: photoUrlSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, photoUrl, ...data } = input;
      return ctx.prisma.menuItem.update({
        where: { id },
        data: {
          ...data,
          ...(photoUrl !== undefined ? { photoUrl: photoUrl || null } : {}),
        },
      });
    }),

  /**
   * True delete — only for an item that's never actually been ordered.
   * Anything with order history stays forever (§45) and gets deactivated
   * instead, same pattern as tables/categories.
   */
  deleteItem: permissionProcedure(Permission.MANAGE_MENU)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.prisma.menuItem.findUnique({
        where: { id: input.id },
        include: { _count: { select: { orderItems: true } } },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      if (item._count.orderItems > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${item.nameEn}" has been ordered before and can't be deleted — mark it Inactive instead to take it off the menu.`,
        });
      }
      await ctx.prisma.menuItem.delete({ where: { id: input.id } });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "MENU_ITEM_DELETED",
        entityType: "MenuItem",
        entityId: input.id,
        previousValue: { nameEn: item.nameEn },
      });
      return { ok: true };
    }),

  // --- Modifier groups & options -----------------------------------------

  listModifierGroups: staffProcedure.query(async ({ ctx }) => {
    return ctx.prisma.modifierGroup.findMany({
      include: { options: { orderBy: { sortOrder: "asc" } } },
      orderBy: { nameEn: "asc" },
    });
  }),

  createModifierGroup: permissionProcedure(Permission.MANAGE_MENU)
    .input(
      z.object({
        nameTh: z.string().min(1),
        nameEn: z.string().min(1),
        required: z.boolean().default(false),
        multiSelect: z.boolean().default(false),
        minSelect: z.number().int().min(0).default(0),
        maxSelect: z.number().int().min(1).default(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.modifierGroup.create({ data: input });
    }),

  updateModifierGroup: permissionProcedure(Permission.MANAGE_MENU)
    .input(
      z.object({
        id: z.string(),
        nameTh: z.string().min(1).optional(),
        nameEn: z.string().min(1).optional(),
        required: z.boolean().optional(),
        multiSelect: z.boolean().optional(),
        minSelect: z.number().int().min(0).optional(),
        maxSelect: z.number().int().min(1).optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.modifierGroup.update({ where: { id }, data });
    }),

  /**
   * True delete for a modifier group. Any options under it that were ever
   * used in an order block the delete at the DB layer (no cascade from
   * OrderItemModifier) — caught here and turned into a friendly message
   * pointing at Inactive instead, same as everywhere else history matters.
   */
  deleteModifierGroup: permissionProcedure(Permission.MANAGE_MENU)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const group = await ctx.prisma.modifierGroup.findUnique({
        where: { id: input.id },
      });
      if (!group) throw new TRPCError({ code: "NOT_FOUND" });
      try {
        await ctx.prisma.modifierGroup.delete({ where: { id: input.id } });
      } catch (err) {
        if (isFkViolation(err)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `"${group.nameEn}" has options used in past orders and can't be deleted — mark it Inactive instead.`,
          });
        }
        throw err;
      }
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "MODIFIER_GROUP_DELETED",
        entityType: "ModifierGroup",
        entityId: input.id,
        previousValue: { nameEn: group.nameEn },
      });
      return { ok: true };
    }),

  addModifierOption: permissionProcedure(Permission.MANAGE_MENU)
    .input(
      z.object({
        groupId: z.string(),
        nameTh: z.string().min(1),
        nameEn: z.string().min(1),
        priceAdjustment: z.number().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { groupId, ...rest } = input;
      const last = await ctx.prisma.modifierOption.findFirst({
        where: { groupId },
        orderBy: { sortOrder: "desc" },
      });
      return ctx.prisma.modifierOption.create({
        data: { ...rest, groupId, sortOrder: (last?.sortOrder ?? -1) + 1 },
      });
    }),

  updateModifierOption: permissionProcedure(Permission.MANAGE_MENU)
    .input(
      z.object({
        id: z.string(),
        nameTh: z.string().min(1).optional(),
        nameEn: z.string().min(1).optional(),
        priceAdjustment: z.number().optional(),
        active: z.boolean().optional(),
        soldOut: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.modifierOption.update({ where: { id }, data });
    }),

  /** Same history guard as deleteModifierGroup, at the option level. */
  deleteModifierOption: permissionProcedure(Permission.MANAGE_MENU)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const option = await ctx.prisma.modifierOption.findUnique({
        where: { id: input.id },
      });
      if (!option) throw new TRPCError({ code: "NOT_FOUND" });
      try {
        await ctx.prisma.modifierOption.delete({ where: { id: input.id } });
      } catch (err) {
        if (isFkViolation(err)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `"${option.nameEn}" has been ordered before and can't be deleted — mark it Inactive or Sold out instead.`,
          });
        }
        throw err;
      }
      return { ok: true };
    }),

  // --- Attach / detach modifier groups on an item ------------------------

  attachModifierGroup: permissionProcedure(Permission.MANAGE_MENU)
    .input(z.object({ menuItemId: z.string(), modifierGroupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.menuItemModifierGroup.findUnique({
        where: {
          menuItemId_modifierGroupId: {
            menuItemId: input.menuItemId,
            modifierGroupId: input.modifierGroupId,
          },
        },
      });
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already attached." });
      }
      return ctx.prisma.menuItemModifierGroup.create({ data: input });
    }),

  detachModifierGroup: permissionProcedure(Permission.MANAGE_MENU)
    .input(z.object({ menuItemId: z.string(), modifierGroupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.menuItemModifierGroup.delete({
        where: {
          menuItemId_modifierGroupId: {
            menuItemId: input.menuItemId,
            modifierGroupId: input.modifierGroupId,
          },
        },
      });
      return { ok: true };
    }),
});
