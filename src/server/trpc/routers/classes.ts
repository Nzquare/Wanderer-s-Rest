import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { logAudit } from "@/server/audit";

// Adventurer classes are membership-flavor configuration in the same
// spirit as Ranks — gated behind MANAGE_SETTINGS rather than a dedicated
// new Permission enum value (§Class emoji).
const manage = () => permissionProcedure(Permission.MANAGE_SETTINGS);

const classShape = z.object({
  nameTh: z.string().min(1),
  nameEn: z.string().min(1),
  icon: z.string().optional(),
});

export const classesRouter = router({
  /** Active only, for pickers (member profile's Class dropdown) — any staff can read. */
  list: staffProcedure.query(({ ctx }) => {
    return ctx.prisma.adventurerClass.findMany({
      where: { active: true },
      orderBy: { nameEn: "asc" },
    });
  }),

  /** Back Office management list — includes how many members currently hold each class. */
  listAll: manage().query(async ({ ctx }) => {
    const classes = await ctx.prisma.adventurerClass.findMany({
      orderBy: { nameEn: "asc" },
      include: { _count: { select: { members: true } } },
    });
    return classes.map((c) => ({ ...c, memberCount: c._count.members }));
  }),

  create: manage()
    .input(classShape)
    .mutation(async ({ ctx, input }) => {
      const created = await ctx.prisma.adventurerClass.create({ data: input });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "CLASS_CREATED",
        entityType: "AdventurerClass",
        entityId: created.id,
        newValue: { nameEn: created.nameEn, icon: created.icon },
      });
      return created;
    }),

  update: manage()
    .input(classShape.partial().extend({ id: z.string(), active: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.adventurerClass.update({ where: { id }, data });
    }),

  /**
   * True delete — only for a class no member currently holds. Same
   * §45-adjacent pattern as ranks/menu/promotions: something in active
   * use gets deactivated instead of deleted outright.
   */
  remove: manage()
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cls = await ctx.prisma.adventurerClass.findUnique({
        where: { id: input.id },
        include: { _count: { select: { members: true } } },
      });
      if (!cls) throw new TRPCError({ code: "NOT_FOUND" });
      if (cls._count.members > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${cls._count.members} member(s) currently have "${cls.nameEn}" — mark it inactive instead, or move them to a different class first (their profile's Class dropdown).`,
        });
      }
      await ctx.prisma.adventurerClass.delete({ where: { id: input.id } });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "CLASS_DELETED",
        entityType: "AdventurerClass",
        entityId: input.id,
        previousValue: { nameEn: cls.nameEn },
      });
      return { ok: true };
    }),
});
