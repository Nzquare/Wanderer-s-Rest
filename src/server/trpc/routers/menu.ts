import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { toNum } from "@/lib/decimal";

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

  listCategories: staffProcedure.query(async ({ ctx }) => {
    return ctx.prisma.menuCategory.findMany({ orderBy: { sortOrder: "asc" } });
  }),

  createCategory: permissionProcedure(Permission.MANAGE_MENU)
    .input(z.object({ nameTh: z.string().min(1), nameEn: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.menuCategory.create({ data: input });
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.menuItem.create({ data: input });
    }),

  updateItem: permissionProcedure(Permission.MANAGE_MENU)
    .input(
      z.object({
        id: z.string(),
        nameTh: z.string().min(1).optional(),
        nameEn: z.string().min(1).optional(),
        basePrice: z.number().min(0).optional(),
        active: z.boolean().optional(),
        soldOut: z.boolean().optional(),
        featured: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.menuItem.update({ where: { id }, data });
    }),

  listModifierGroups: staffProcedure.query(async ({ ctx }) => {
    return ctx.prisma.modifierGroup.findMany({
      include: { options: true },
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
      return ctx.prisma.modifierOption.create({
        data: { ...rest, groupId },
      });
    }),

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
});
