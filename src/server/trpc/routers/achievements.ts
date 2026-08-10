import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { logAudit } from "@/server/audit";

const categoryEnum = z.enum([
  "VISITS",
  "GAMES",
  "SPENDING",
  "LEVEL",
  "RANK",
  "EVENTS",
  "SOCIAL",
  "SECRET",
  "SPECIAL",
]);
const typeEnum = z.enum(["AUTOMATIC", "MANUAL"]);
const triggerTypeEnum = z.enum([
  "VISIT_COUNT",
  "RANK_REACHED",
  "LEVEL_REACHED",
  "UNIQUE_GAMES_COUNT",
  "COOP_GAMES_COUNT",
  "CATEGORY_GAMES_COUNT",
  "CATEGORIES_PLAYED_COUNT",
  "SPECIFIC_GAME_PLAYED",
  "TOTAL_GAMES_COUNT",
  "LIFETIME_SPEND",
  "CUSTOM",
]);
const benefitTypeEnum = z.enum([
  "FREE_ITEM",
  "FIXED_DISCOUNT",
  "PERCENT_DISCOUNT",
  "FREE_TABLE_TIME",
  "SPECIAL_PRICE",
  "FREE_DRINK",
  "PRIVILEGE",
  "CUSTOM",
]);

const manage = () => permissionProcedure(Permission.MANAGE_SETTINGS);

export const achievementsRouter = router({
  list: staffProcedure.query(({ ctx }) => {
    return ctx.prisma.achievement.findMany({ orderBy: { createdAt: "asc" } });
  }),

  listManualAwardable: permissionProcedure(Permission.AWARD_ACHIEVEMENTS).query(({ ctx }) => {
    return ctx.prisma.achievement.findMany({
      where: { type: "MANUAL", active: true },
      orderBy: { nameEn: "asc" },
    });
  }),

  create: manage()
    .input(
      z.object({
        code: z.string().min(1),
        nameTh: z.string().min(1),
        nameEn: z.string().min(1),
        descriptionTh: z.string().optional(),
        descriptionEn: z.string().optional(),
        icon: z.string().optional(),
        category: categoryEnum,
        type: typeEnum,
        hidden: z.boolean().default(false),
        repeatable: z.boolean().default(false),
        triggerType: triggerTypeEnum.optional(),
        triggerValue: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
        hasReward: z.boolean().default(false),
        benefitType: benefitTypeEnum.optional(),
        benefitConfig: z.object({ value: z.number().optional() }).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.achievement.findUnique({
        where: { code: input.code },
      });
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Achievement code is taken." });
      }
      return ctx.prisma.achievement.create({ data: input });
    }),

  update: manage()
    .input(
      z.object({
        id: z.string(),
        nameTh: z.string().min(1).optional(),
        nameEn: z.string().min(1).optional(),
        descriptionTh: z.string().optional(),
        descriptionEn: z.string().optional(),
        icon: z.string().optional(),
        category: categoryEnum.optional(),
        hidden: z.boolean().optional(),
        repeatable: z.boolean().optional(),
        active: z.boolean().optional(),
        triggerType: triggerTypeEnum.optional(),
        triggerValue: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
        hasReward: z.boolean().optional(),
        benefitType: benefitTypeEnum.optional(),
        benefitConfig: z.object({ value: z.number().optional() }).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.achievement.update({ where: { id }, data });
    }),

  /**
   * True delete — only for an achievement no member has ever earned.
   * Anything with award history stays forever (§45) and gets deactivated
   * instead, same pattern as menu/tables/promotions.
   */
  delete: manage()
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const achievement = await ctx.prisma.achievement.findUnique({
        where: { id: input.id },
        include: { _count: { select: { memberAchievements: true } } },
      });
      if (!achievement) throw new TRPCError({ code: "NOT_FOUND" });
      if (achievement._count.memberAchievements > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${achievement.nameEn}" has already been earned by ${achievement._count.memberAchievements} member(s) and can't be deleted — mark it Inactive instead.`,
        });
      }
      await ctx.prisma.achievement.delete({ where: { id: input.id } });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "ACHIEVEMENT_DELETED",
        entityType: "Achievement",
        entityId: input.id,
        previousValue: { nameEn: achievement.nameEn, code: achievement.code },
      });
      return { ok: true };
    }),

  /** Predefined-manual-award-only per §30: staff pick from this catalog, never invent one. */
  award: permissionProcedure(Permission.AWARD_ACHIEVEMENTS)
    .input(
      z.object({
        memberId: z.string(),
        achievementId: z.string(),
        note: z.string().max(300).optional(),
        sessionId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const achievement = await ctx.prisma.achievement.findUnique({
        where: { id: input.achievementId },
      });
      if (!achievement || achievement.type !== "MANUAL" || !achievement.active) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Not a valid manual achievement.",
        });
      }
      if (!achievement.repeatable) {
        const existing = await ctx.prisma.memberAchievement.findFirst({
          where: { memberId: input.memberId, achievementId: input.achievementId },
        });
        if (existing) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Member already has this achievement.",
          });
        }
      }

      const memberAchievement = await ctx.prisma.memberAchievement.create({
        data: {
          memberId: input.memberId,
          achievementId: input.achievementId,
          awardedById: ctx.staff.id,
          note: input.note,
          sessionId: input.sessionId,
        },
      });

      if (achievement.hasReward) {
        await ctx.prisma.benefitRedemption.create({
          data: { memberAchievementId: memberAchievement.id },
        });
      }

      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "ACHIEVEMENT_AWARDED",
        entityType: "Member",
        entityId: input.memberId,
        newValue: { achievementId: achievement.id, achievementCode: achievement.code },
        reason: input.note,
      });

      return { ok: true };
    }),
});
