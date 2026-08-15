import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { logAudit } from "@/server/audit";

export const benefitsRouter = router({
  /**
   * Manually marks a member's earned reward as given out (§Benefits) —
   * the escape hatch for when it's honored outside of an open bill (no
   * table, nothing to apply a promotion discount to). The normal path is
   * checkout.applyPromotion, which already flips this same
   * BenefitRedemption to USED as a side effect of applying the member's
   * earned promotion to their bill — this exists for everything else.
   * Lives on the member's own page, gated the same as updateProfile since
   * it's fundamentally a member-record edit.
   */
  redeem: permissionProcedure(Permission.MANAGE_MEMBERS)
    .input(z.object({ id: z.string(), sessionId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const redemption = await ctx.prisma.benefitRedemption.findUnique({
        where: { id: input.id },
        include: {
          memberAchievement: { include: { member: true, achievement: true } },
        },
      });
      if (!redemption) throw new TRPCError({ code: "NOT_FOUND" });
      if (redemption.status !== "AVAILABLE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This benefit is already ${redemption.status.toLowerCase()}.`,
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
        entityId: redemption.id,
        previousValue: { status: "AVAILABLE" },
        newValue: { status: "USED" },
        reason: `${redemption.memberAchievement.member.adventurerName} — ${redemption.memberAchievement.achievement.nameEn}`,
      });

      return updated;
    }),
});
