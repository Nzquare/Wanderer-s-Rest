import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { router, permissionProcedure, cashierProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { toNum } from "@/lib/decimal";
import { computeTableFee } from "@/server/domain/pricing";
import {
  computeDiscountAmount,
  isPromotionEligible,
  type PromotionConfig,
} from "@/server/domain/discounts";
import { computeBill, eligibleExpSpending } from "@/server/domain/billing";
import { expFromSpending, computeProgression } from "@/server/domain/exp";
import { evaluateNewlyUnlocked, type AchievementDef } from "@/server/domain/achievements";
import { getSettings } from "@/server/settings/service";
import { logAudit } from "@/server/audit";
import { toPlayerRecord, toPricingConfig } from "./sessions";
import type { Prisma } from "@/generated/prisma/client";

const checkoutInclude = {
  table: true,
  players: true,
  pricingType: true,
  package: true,
  member: true,
  orders: {
    where: { status: "SUBMITTED" as const },
    include: { items: { include: { modifiers: true } } },
  },
  appliedDiscounts: { include: { appliedBy: { select: { name: true } } } },
} satisfies Prisma.TableSessionInclude;

async function loadSessionForCheckout(
  prisma: Prisma.TransactionClient,
  sessionId: string,
) {
  const session = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    include: checkoutInclude,
  });
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
  return session;
}

async function computeBreakdown(
  session: Awaited<ReturnType<typeof loadSessionForCheckout>>,
) {
  const tableFee = computeTableFee({
    pricingType: toPricingConfig(session.pricingType),
    players: session.players.map(toPlayerRecord),
  });
  const foodDrinkItems = session.orders.flatMap((o) =>
    o.items.map((i) => ({
      id: i.id,
      nameEn: i.nameSnapshotEn,
      quantity: i.quantity,
      unitPrice: toNum(i.unitPriceSnapshot),
      lineTotal: toNum(i.unitPriceSnapshot) * i.quantity,
    })),
  );
  const foodDrinkSubtotal = foodDrinkItems.reduce((s, i) => s + i.lineTotal, 0);

  const checkoutSettings = await getSettings("checkout");
  const bill = computeBill({
    tableFeeTotal: tableFee.total,
    foodDrinkSubtotal,
    discounts: session.appliedDiscounts.map((d) => ({
      promotionId: d.promotionId,
      label: d.label,
      amount: toNum(d.amount),
    })),
    taxEnabled: checkoutSettings.taxEnabled,
    taxPercent: checkoutSettings.taxPercent,
    serviceChargeEnabled: checkoutSettings.serviceChargeEnabled,
    serviceChargePercent: checkoutSettings.serviceChargePercent,
  });

  return { tableFee, foodDrinkItems, foodDrinkSubtotal, bill, checkoutSettings };
}

function toPromotionConfig(p: {
  id: string;
  name: string;
  type: string;
  value: unknown;
  rewardMenuItemId: string | null;
  rewardMenuItem: { basePrice: unknown } | null;
  startDate: Date | null;
  endDate: Date | null;
  activeDays: unknown;
  startTime: string | null;
  endTime: string | null;
  minimumSpend: unknown;
  memberOnly: boolean;
  stackable: boolean;
  active: boolean;
}): PromotionConfig {
  return {
    id: p.id,
    name: p.name,
    type: p.type as PromotionConfig["type"],
    // FREE_ITEM ignores the stored `value` entirely — the discount is
    // whatever the reward item currently costs, read live so a later menu
    // price change is honored instead of the price at promotion-creation
    // time.
    value: p.type === "FREE_ITEM" ? toNum(p.rewardMenuItem?.basePrice ?? 0) : toNum(p.value),
    rewardMenuItemId: p.rewardMenuItemId,
    startDate: p.startDate,
    endDate: p.endDate,
    activeDays: (p.activeDays as number[] | null) ?? null,
    startTime: p.startTime,
    endTime: p.endTime,
    minimumSpend: p.minimumSpend == null ? null : Number(p.minimumSpend),
    memberOnly: p.memberOnly,
    stackable: p.stackable,
    active: p.active,
  };
}

/** Feeds the game-based achievement triggers (§36) now that the Game Library exists. */
async function getMemberGameStats(tx: Prisma.TransactionClient, memberId: string) {
  const played = await tx.gameSession.findMany({
    where: { memberId },
    include: { game: { select: { categoryId: true } } },
  });
  const uniqueGameIds = new Set(played.map((p) => p.gameId));
  const categories = new Set(
    played.map((p) => p.game.categoryId).filter((c): c is string => !!c),
  );
  const gamePlayCounts: Record<string, number> = {};
  for (const p of played) {
    gamePlayCounts[p.gameId] = (gamePlayCounts[p.gameId] ?? 0) + 1;
  }
  return {
    totalGamesCount: played.length,
    uniqueGamesCount: uniqueGameIds.size,
    categoriesPlayedCount: categories.size,
    specificGamesPlayed: Array.from(uniqueGameIds),
    gamePlayCounts,
  };
}

export const checkoutRouter = router({
  getPreview: cashierProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await loadSessionForCheckout(ctx.prisma, input.sessionId);
      const { tableFee, foodDrinkItems, bill } = await computeBreakdown(session);

      const membershipSettings = await getSettings("membership");
      let memberPreview = null;
      if (session.member) {
        const eligible = eligibleExpSpending(bill);
        const projectedExp = expFromSpending(eligible, membershipSettings.bahtPerExp);
        const ranks = await ctx.prisma.rank.findMany({ orderBy: { order: "asc" } });
        const before = computeProgression(
          session.member.lifetimeExp,
          membershipSettings.expPerLevel,
          ranks,
        );
        const after = computeProgression(
          session.member.lifetimeExp + projectedExp,
          membershipSettings.expPerLevel,
          ranks,
        );
        memberPreview = {
          id: session.member.id,
          adventurerName: session.member.adventurerName,
          projectedExp,
          levelBefore: before.totalLevel,
          levelAfter: after.totalLevel,
          rankBefore: before.rank.nameEn,
          rankAfter: after.rank.nameEn,
        };
      }

      return {
        table: session.table,
        players: session.players.map((p) => ({
          id: p.id,
          label: p.label,
          status: p.status,
        })),
        tableFeeLines: tableFee.lines,
        // FIXED/PACKAGE pricing isn't billed by elapsed time — the
        // checkout bill shows "All day" instead of a per-player minutes
        // breakdown that wouldn't apply for those (§7).
        pricingModel: session.pricingType?.model ?? "HOURLY",
        foodDrinkItems,
        appliedDiscounts: session.appliedDiscounts.map((d) => ({
          id: d.id,
          label: d.label,
          amount: toNum(d.amount),
          appliedByName: d.appliedBy.name,
        })),
        bill,
        memberPreview,
        sessionStatus: session.status,
        paymentStatus: session.paymentStatus,
      };
    }),

  applyManualDiscount: permissionProcedure(Permission.APPLY_DISCOUNTS)
    .input(
      z.object({
        sessionId: z.string(),
        type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
        value: z.number().positive(),
        reason: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await loadSessionForCheckout(ctx.prisma, input.sessionId);
      if (session.paymentStatus === "PAID") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session already paid." });
      }
      const { tableFee, foodDrinkSubtotal } = await computeBreakdown(session);
      const existingDiscountTotal = session.appliedDiscounts.reduce(
        (s, d) => s + toNum(d.amount),
        0,
      );
      const base = Math.max(
        0,
        tableFee.total + foodDrinkSubtotal - existingDiscountTotal,
      );
      const amount = computeDiscountAmount({ type: input.type, value: input.value }, base);
      const label =
        input.type === "PERCENTAGE"
          ? `Manual ${input.value}% off — ${input.reason}`
          : `Manual ฿${input.value} off — ${input.reason}`;

      await ctx.prisma.appliedDiscount.create({
        data: {
          sessionId: session.id,
          label,
          amount,
          appliedById: ctx.staff.id,
        },
      });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "DISCOUNT_OVERRIDE",
        entityType: "TableSession",
        entityId: session.id,
        newValue: { label, amount },
        reason: input.reason,
      });
      return { ok: true, amount };
    }),

  /**
   * Promotions (§19) a cashier can actually apply to this bill right now —
   * active, in their date/day/time window, member-only respected, minimum
   * spend met — with the discount amount pre-computed so the checkout
   * screen can show "Happy Hour 20% off — save ฿40" instead of just a name.
   * Already-applied promotions are excluded so the same one can't stack
   * with itself.
   */
  listEligiblePromotions: cashierProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await loadSessionForCheckout(ctx.prisma, input.sessionId);
      const { tableFee, foodDrinkSubtotal } = await computeBreakdown(session);
      const existingDiscountTotal = session.appliedDiscounts.reduce(
        (s, d) => s + toNum(d.amount),
        0,
      );
      const base = Math.max(0, tableFee.total + foodDrinkSubtotal - existingDiscountTotal);
      const appliedPromotionIds = new Set(
        session.appliedDiscounts.map((d) => d.promotionId).filter((id): id is string => !!id),
      );
      const orderedMenuItemIds = new Set(
        session.orders.flatMap((o) => o.items.map((i) => i.menuItemId)),
      );

      const promotions = await ctx.prisma.promotion.findMany({
        where: { active: true },
        include: { rewardMenuItem: { select: { basePrice: true, nameEn: true } } },
      });
      const now = new Date();
      return promotions
        .filter((p) => !appliedPromotionIds.has(p.id))
        .map(toPromotionConfig)
        .filter((p) =>
          isPromotionEligible(p, {
            now,
            hasMember: !!session.member,
            currentSpend: base,
            orderedMenuItemIds,
          }),
        )
        .map((p) => {
          const source = promotions.find((raw) => raw.id === p.id);
          return {
            id: p.id,
            name: p.name,
            type: p.type,
            value: p.value,
            stackable: p.stackable,
            memberOnly: p.memberOnly,
            rewardMenuItemName: source?.rewardMenuItem?.nameEn ?? null,
            previewAmount: computeDiscountAmount(p, base),
          };
        });
    }),

  applyPromotion: permissionProcedure(Permission.APPLY_DISCOUNTS)
    .input(z.object({ sessionId: z.string(), promotionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await loadSessionForCheckout(ctx.prisma, input.sessionId);
      if (session.paymentStatus === "PAID") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session already paid." });
      }
      const promotion = await ctx.prisma.promotion.findUnique({
        where: { id: input.promotionId },
        include: { rewardMenuItem: { select: { basePrice: true, nameEn: true } } },
      });
      if (!promotion) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.appliedDiscounts.some((d) => d.promotionId === promotion.id)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already applied." });
      }

      const { tableFee, foodDrinkSubtotal } = await computeBreakdown(session);
      const existingDiscountTotal = session.appliedDiscounts.reduce(
        (s, d) => s + toNum(d.amount),
        0,
      );
      const base = Math.max(0, tableFee.total + foodDrinkSubtotal - existingDiscountTotal);
      const orderedMenuItemIds = new Set(
        session.orders.flatMap((o) => o.items.map((i) => i.menuItemId)),
      );
      const config = toPromotionConfig(promotion);
      // Re-check eligibility server-side rather than trusting the client's
      // stale preview — a promotion's window or minimum spend may have
      // moved between the preview query and this click.
      if (
        !isPromotionEligible(config, {
          now: new Date(),
          hasMember: !!session.member,
          currentSpend: base,
          orderedMenuItemIds,
        })
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${promotion.name}" isn't eligible for this bill right now.`,
        });
      }
      const amount = computeDiscountAmount(config, base);
      const label =
        promotion.type === "FREE_ITEM" && promotion.rewardMenuItem
          ? `${promotion.name} (free: ${promotion.rewardMenuItem.nameEn})`
          : promotion.name;

      await ctx.prisma.appliedDiscount.create({
        data: {
          sessionId: session.id,
          promotionId: promotion.id,
          label,
          amount,
          appliedById: ctx.staff.id,
        },
      });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "PROMOTION_APPLIED",
        entityType: "TableSession",
        entityId: session.id,
        newValue: { promotionId: promotion.id, label, amount },
      });
      return { ok: true, amount };
    }),

  /**
   * Every active promotion, regardless of current eligibility — feeds the
   * manual "Apply discount" picker's promotion mode (distinct from
   * listEligiblePromotions' auto-eligible one-tap list above). Lets a
   * cashier apply a promotion a manager has verbally approved outside its
   * normal window/minimum-spend/day — applyPromotionOverride below is the
   * matching mutation, and it requires a reason precisely because it
   * bypasses those checks.
   */
  listAllPromotions: permissionProcedure(Permission.APPLY_DISCOUNTS).query(async ({ ctx }) => {
    const promotions = await ctx.prisma.promotion.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { rewardMenuItem: { select: { nameEn: true } } },
    });
    return promotions.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type as "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_ITEM",
      value: toNum(p.value),
      rewardMenuItemName: p.rewardMenuItem?.nameEn ?? null,
    }));
  }),

  /**
   * Manually apply a specific Back Office promotion with a required reason,
   * skipping the date/day/time/minimum-spend/member-only eligibility
   * checks listEligiblePromotions/applyPromotion enforce — this is the
   * override path for "manager approved Happy Hour early" type cases. The
   * one eligibility check that still applies is FREE_ITEM's: you can't
   * give away an item that isn't actually in the order, override or not.
   * Unlike applyManualDiscount's free-typed amount, this always links back
   * to a real Promotion row (promotionId on the resulting AppliedDiscount)
   * so it's traceable to what was actually approved.
   */
  applyPromotionOverride: permissionProcedure(Permission.APPLY_DISCOUNTS)
    .input(
      z.object({
        sessionId: z.string(),
        promotionId: z.string(),
        reason: z.string().min(1).max(300),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await loadSessionForCheckout(ctx.prisma, input.sessionId);
      if (session.paymentStatus === "PAID") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session already paid." });
      }
      const promotion = await ctx.prisma.promotion.findUnique({
        where: { id: input.promotionId },
        include: { rewardMenuItem: { select: { basePrice: true, nameEn: true } } },
      });
      if (!promotion || !promotion.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a valid active promotion." });
      }
      if (session.appliedDiscounts.some((d) => d.promotionId === promotion.id)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already applied." });
      }

      const { tableFee, foodDrinkSubtotal } = await computeBreakdown(session);
      const existingDiscountTotal = session.appliedDiscounts.reduce(
        (s, d) => s + toNum(d.amount),
        0,
      );
      const base = Math.max(0, tableFee.total + foodDrinkSubtotal - existingDiscountTotal);
      const config = toPromotionConfig(promotion);

      if (config.type === "FREE_ITEM") {
        const orderedMenuItemIds = new Set(
          session.orders.flatMap((o) => o.items.map((i) => i.menuItemId)),
        );
        if (!config.rewardMenuItemId || !orderedMenuItemIds.has(config.rewardMenuItemId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `"${promotion.name}" gives away ${promotion.rewardMenuItem?.nameEn ?? "an item"}, which isn't in this order.`,
          });
        }
      }

      const amount = computeDiscountAmount(config, base);
      const baseLabel =
        promotion.type === "FREE_ITEM" && promotion.rewardMenuItem
          ? `${promotion.name} (free: ${promotion.rewardMenuItem.nameEn})`
          : promotion.name;
      const label = `${baseLabel} — override: ${input.reason}`;

      await ctx.prisma.appliedDiscount.create({
        data: {
          sessionId: session.id,
          promotionId: promotion.id,
          label,
          amount,
          appliedById: ctx.staff.id,
        },
      });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "PROMOTION_APPLIED",
        entityType: "TableSession",
        entityId: session.id,
        newValue: { promotionId: promotion.id, label, amount, override: true },
        reason: input.reason,
      });
      return { ok: true, amount };
    }),

  removeDiscount: permissionProcedure(Permission.APPLY_DISCOUNTS)
    .input(z.object({ discountId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.appliedDiscount.delete({ where: { id: input.discountId } });
      return { ok: true };
    }),

  recordPayment: cashierProcedure
    .input(
      z.object({
        sessionId: z.string(),
        payments: z
          .array(
            z.object({
              method: z.enum(["CASH", "PROMPTPAY", "CARD", "OTHER"]),
              amount: z.number().positive(),
              reference: z.string().optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const session = await loadSessionForCheckout(tx, input.sessionId);
        if (session.paymentStatus === "PAID") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Already paid." });
        }
        if (
          !["READY_FOR_CHECKOUT", "OPEN", "PAUSED", "CHECKOUT_IN_PROGRESS"].includes(
            session.status,
          )
        ) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Session cannot be paid." });
        }

        const openShift = await tx.shift.findFirst({ where: { status: "OPEN" } });
        if (!openShift) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Open a shift before taking payment.",
          });
        }

        const { tableFee, foodDrinkItems, foodDrinkSubtotal, bill } = await computeBreakdown(session);
        const paidTotal = input.payments.reduce((s, p) => s + p.amount, 0);
        if (Math.abs(paidTotal - bill.total) > 0.5) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Payment total ฿${paidTotal.toFixed(0)} doesn't match bill total ฿${bill.total.toFixed(0)}.`,
          });
        }

        for (const p of input.payments) {
          await tx.payment.create({
            data: {
              sessionId: session.id,
              shiftId: openShift.id,
              amount: p.amount,
              method: p.method,
              reference: p.reference,
              staffId: ctx.staff.id,
            },
          });
        }

        // ── Member EXP / progression (§53) ──────────────────────────────
        let expSummary: {
          expAwarded: number;
          lifetimeExpAfter: number;
          levelBefore: number;
          levelAfter: number;
          rankBefore: string;
          rankAfter: string;
        } | null = null;
        let unlockedAchievements: { nameEn: string }[] = [];

        if (session.member) {
          const membershipSettings = await getSettings("membership");
          const eligible = eligibleExpSpending(bill);
          const expAwarded = expFromSpending(eligible, membershipSettings.bahtPerExp);
          const ranks = await tx.rank.findMany({ orderBy: { order: "asc" } });
          const before = computeProgression(
            session.member.lifetimeExp,
            membershipSettings.expPerLevel,
            ranks,
          );
          const newLifetimeExp = session.member.lifetimeExp + expAwarded;
          const after = computeProgression(
            newLifetimeExp,
            membershipSettings.expPerLevel,
            ranks,
          );

          await tx.member.update({
            where: { id: session.member.id },
            data: {
              lifetimeExp: newLifetimeExp,
              lifetimeSpending: { increment: eligible },
              visits: { increment: 1 },
              lastVisit: new Date(),
              rankId: after.rank.id,
            },
          });
          await tx.expHistory.create({
            data: {
              memberId: session.member.id,
              sessionId: session.id,
              amount: expAwarded,
              reason: "PURCHASE",
              staffId: ctx.staff.id,
              lifetimeExpAfter: newLifetimeExp,
            },
          });

          expSummary = {
            expAwarded,
            lifetimeExpAfter: newLifetimeExp,
            levelBefore: before.totalLevel,
            levelAfter: after.totalLevel,
            rankBefore: before.rank.nameEn,
            rankAfter: after.rank.nameEn,
          };

          // ── Automatic achievements (§30, §53) ─────────────────────────
          const [catalog, unlocked, gameStats] = await Promise.all([
            tx.achievement.findMany({ where: { type: "AUTOMATIC", active: true } }),
            tx.memberAchievement.findMany({ where: { memberId: session.member.id } }),
            getMemberGameStats(tx, session.member.id),
          ]);
          const newlyUnlocked = evaluateNewlyUnlocked(
            catalog as unknown as AchievementDef[],
            new Set(unlocked.map((u) => u.achievementId)),
            {
              visits: session.member.visits + 1,
              totalLevel: after.totalLevel,
              rankOrder: after.rank.order,
              lifetimeSpending: toNum(session.member.lifetimeSpending) + eligible,
              ...gameStats,
            },
          );
          for (const achievement of newlyUnlocked) {
            const ma = await tx.memberAchievement.create({
              data: {
                memberId: session.member.id,
                achievementId: achievement.id,
                sessionId: session.id,
              },
            });
            if ((achievement as unknown as { hasReward: boolean }).hasReward) {
              await tx.benefitRedemption.create({
                data: { memberAchievementId: ma.id },
              });
            }
          }
          unlockedAchievements = newlyUnlocked.map((a) => ({
            nameEn: (a as unknown as { nameEn: string }).nameEn,
          }));
        }

        const receiptNumber = `WR-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
        const snapshot = {
          receiptNumber,
          table: { code: session.table.code, name: session.table.name },
          players: session.players.length,
          tableFeeLines: tableFee.lines,
          // FIXED/PACKAGE pricing isn't billed by elapsed time — the
          // printed/stored receipt shows "All day" instead of a per-player
          // minutes breakdown that wouldn't apply for those (§7).
          pricingModel: session.pricingType?.model ?? "HOURLY",
          foodDrinkItems,
          foodDrinkSubtotal,
          discounts: session.appliedDiscounts.map((d) => ({
            label: d.label,
            amount: toNum(d.amount),
          })),
          bill,
          payments: input.payments,
          member: session.member ? { adventurerName: session.member.adventurerName } : null,
          expAwarded: expSummary?.expAwarded ?? 0,
          unlockedAchievements,
          staff: ctx.staff.name,
          closedAt: new Date().toISOString(),
        };
        // Round-trip through JSON so the Prisma Json column type-checks
        // cleanly against our (structurally identical but nominally typed)
        // domain interfaces.
        const snapshotJson = JSON.parse(JSON.stringify(snapshot));

        await tx.receipt.create({
          data: {
            sessionId: session.id,
            receiptNumber,
            snapshot: snapshotJson,
          },
        });

        await tx.tableSession.update({
          where: { id: session.id },
          data: {
            status: "CLOSED",
            paymentStatus: "PAID",
            endTime: new Date(),
            closedById: ctx.staff.id,
            subtotalTableFee: tableFee.total,
            subtotalFoodDrink: foodDrinkSubtotal,
            discountTotal: bill.discountTotal,
            taxAmount: bill.taxAmount,
            serviceChargeAmount: bill.serviceChargeAmount,
            totalAmount: bill.total,
            expAwarded: expSummary?.expAwarded ?? 0,
            billSnapshot: snapshotJson,
          },
        });

        await tx.restaurantTable.update({
          where: { id: session.tableId },
          data: { status: "CLEANING" },
        });

        return { receiptNumber, bill, expSummary, unlockedAchievements, snapshot };
      });
    }),

  markTableAvailable: permissionProcedure(Permission.MANAGE_TABLES)
    .input(z.object({ tableId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.restaurantTable.update({
        where: { id: input.tableId },
        data: { status: "AVAILABLE" },
      });
      return { ok: true };
    }),
});
