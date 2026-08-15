import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { logAudit } from "@/server/audit";

// Same gate as updateProfile in members.ts — redeeming a benefit is
// "updating what this member's record shows they're owed," the same
// bucket as any other member-record edit, and it keeps this reachable by
// whoever can already view/edit a member (Back Office's Members nav is
// keyed off this same permission) rather than needing a new enum value.
const manage = () => permissionProcedure(Permission.MANAGE_MEMBERS);

export const benefitsRouter = router({
  /**
   * The membership-wide "who's owed something" ledger — every
   * BenefitRedemption row across every member, which previously had no
   * home except drilling into one member's profile at a time
   * (§Benefits management).
   */
  listAll: manage()
    .input(z.object({ status: z.enum(["AVAILABLE", "USED", "EXPIRED"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.benefitRedemption.findMany({
        where: input?.status ? { status: input.status } : undefined,
        include: {
          memberAchievement: {
            include: {
              member: { select: { id: true, adventurerName: true, phone: true } },
              achievement: {
                select: { nameEn: true, icon: true, benefitType: true, benefitConfig: true },
              },
            },
          },
          usedBy: { select: { name: true } },
        },
        orderBy: { earnedAt: "desc" },
        take: 200,
      });
      return rows.map((r) => ({
        id: r.id,
        status: r.status,
        earnedAt: r.earnedAt,
        usedAt: r.usedAt,
        usedByName: r.usedBy?.name ?? null,
        memberId: r.memberAchievement.member.id,
        memberName: r.memberAchievement.member.adventurerName,
        memberPhone: r.memberAchievement.member.phone,
        achievementNameEn: r.memberAchievement.achievement.nameEn,
        icon: r.memberAchievement.achievement.icon,
        benefitType: r.memberAchievement.achievement.benefitType,
        benefitConfig: r.memberAchievement.achievement.benefitConfig,
      }));
    }),

  /**
   * Marks a benefit as given out — who and when, and optionally which
   * table session it was honored at. Deliberately just a record, not a
   * line-item integration with an open bill; that's a bigger future step
   * (auto-applying it as a discount/free item in checkout.ts).
   */
  redeem: manage()
    .input(z.object({ id: z.string(), sessionId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const benefit = await ctx.prisma.benefitRedemption.findUnique({
        where: { id: input.id },
        include: {
          memberAchievement: { include: { member: true, achievement: true } },
        },
      });
      if (!benefit) throw new TRPCError({ code: "NOT_FOUND" });
      if (benefit.status !== "AVAILABLE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This benefit is already ${benefit.status.toLowerCase()}.`,
        });
      }

      const updated = await ctx.prisma.benefitRedemption.update({
        where: { id: input.id },
        data: {
          status: "USED",
          usedAt: new Date(),
          usedById: ctx.staff.id,
          relatedSessionId: input.sessionId,
        },
      });

      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "BENEFIT_REDEEMED",
        entityType: "BenefitRedemption",
        entityId: benefit.id,
        previousValue: { status: "AVAILABLE" },
        newValue: { status: "USED" },
        reason: `${benefit.memberAchievement.member.adventurerName} — ${benefit.memberAchievement.achievement.nameEn}`,
      });

      return updated;
    }),
});
