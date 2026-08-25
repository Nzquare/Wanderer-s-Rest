import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { logAudit } from "@/server/audit";
import { snapshotPromotion } from "@/server/benefit-snapshot";

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
          member: true,
          // Only present when this benefit was earned via an achievement —
          // a direct grant (below) has no achievement to name (see label
          // instead).
          memberAchievement: { include: { achievement: true } },
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
        reason: `${redemption.member.adventurerName} — ${redemption.memberAchievement?.achievement.nameEn ?? redemption.label ?? "manual grant"}`,
      });

      return updated;
    }),

  /**
   * Grant a benefit straight to a member with no achievement involved at
   * all — a birthday reward, a manager's goodwill gesture, anything that
   * isn't earned through the achievement system. Produces the exact same
   * kind of AVAILABLE BenefitRedemption an achievement unlock would, so it
   * shows up in the member's Benefits list, is redeemable at Checkout →
   * Add promotion (checkout.ts's earnedPromotionIds looks members up by
   * memberId directly, not through an achievement), and gets restored by
   * voidSession the same way if the table it was applied to gets voided.
   * Gated the same as redeem/updateProfile — a member-record edit.
   */
  grant: permissionProcedure(Permission.MANAGE_MEMBERS)
    .input(
      z.object({
        memberId: z.string(),
        promotionId: z.string(),
        label: z.string().max(120).optional(),
        expiresAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [member, promotion] = await Promise.all([
        ctx.prisma.member.findUnique({ where: { id: input.memberId } }),
        ctx.prisma.promotion.findUnique({
          where: { id: input.promotionId },
          include: { rewardMenuItem: { select: { nameEn: true } } },
        }),
      ]);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
      if (!promotion || !promotion.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a valid active promotion." });
      }

      const redemption = await ctx.prisma.benefitRedemption.create({
        data: {
          memberId: member.id,
          promotionId: promotion.id,
          ...snapshotPromotion(promotion),
          label: input.label,
          grantedById: ctx.staff.id,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        },
      });

      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "BENEFIT_GRANTED",
        entityType: "BenefitRedemption",
        entityId: redemption.id,
        newValue: { promotionName: promotion.name, label: input.label },
        reason: `${member.adventurerName} — ${input.label || promotion.name}`,
      });

      return redemption;
    }),
});
