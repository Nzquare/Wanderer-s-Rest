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
import { prisma as defaultPrisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

const checkoutInclude = {
  table: true,
  players: true,
  pricingType: true,
  package: true,
  // class included so the receipt (§Receipt member details) can show it
  // alongside the member's name — nothing else in checkout.ts needed the
  // nested relation, member's own scalar fields were enough before this.
  member: { include: { class: true } },
  orders: {
    where: { status: "SUBMITTED" as const },
    include: {
      items: {
        include: { modifiers: true, menuItem: { include: { category: true } } },
      },
    },
  },
  appliedDiscounts: {
    include: {
      appliedBy: { select: { name: true } },
      promotion: { select: { type: true, rewardMenuItemId: true } },
    },
  },
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

/**
 * Groups order items by their menu category (Drinks, Snacks, Goods, ...)
 * instead of one blanket "food/drink" bucket — a café selling retail
 * goods alongside food/drink wants those itemized under their own
 * heading, not mislabeled. Uses the live category (same as the Sales by
 * Category report) rather than a stored snapshot: category name/order is
 * a display grouping, not money, so it doesn't need the price/name
 * snapshot treatment — and this whole grouped shape gets written into the
 * receipt's JSON snapshot at payment time regardless, so a printed
 * receipt is still frozen even if the category is renamed later.
 *
 * Order items are never touched by a Free Item redemption (§Free item
 * redemptions) — the order is what was actually ordered and priced at
 * order time, full stop. A redeemed free item is a separate gift, not a
 * price change on something the guest already ordered/paid for — see
 * computeBreakdown below.
 */
function groupItemsByCategory(
  orders: Array<{
    items: Array<{
      id: string;
      nameSnapshotEn: string;
      quantity: number;
      unitPriceSnapshot: unknown;
      menuItem: { category: { id: string; nameEn: string; sortOrder: number } };
    }>;
  }>,
) {
  const groups = new Map<
    string,
    {
      categoryId: string;
      categoryName: string;
      sortOrder: number;
      subtotal: number;
      items: { id: string; nameEn: string; quantity: number; lineTotal: number }[];
    }
  >();
  for (const order of orders) {
    for (const i of order.items) {
      const cat = i.menuItem.category;
      const lineTotal = toNum(i.unitPriceSnapshot) * i.quantity;
      const group = groups.get(cat.id) ?? {
        categoryId: cat.id,
        categoryName: cat.nameEn,
        sortOrder: cat.sortOrder,
        subtotal: 0,
        items: [],
      };
      group.subtotal += lineTotal;
      group.items.push({ id: i.id, nameEn: i.nameSnapshotEn, quantity: i.quantity, lineTotal });
      groups.set(cat.id, group);
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

async function computeBreakdown(
  session: Awaited<ReturnType<typeof loadSessionForCheckout>>,
  // Pass `tx` when calling this from inside a $transaction block (see
  // recordPayment) — getSettings needs to run on the same connection the
  // transaction is already holding, not grab a second one from the pool
  // (§getSettings).
  client: Prisma.TransactionClient = defaultPrisma,
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
  const itemsByCategory = groupItemsByCategory(session.orders);

  const checkoutSettings = await getSettings("checkout", client);
  const bill = computeBill({
    tableFeeTotal: tableFee.total,
    foodDrinkSubtotal,
    // A redeemed FREE_ITEM promotion is a separate gift (§Free item
    // redemptions), not a discount on the bill — it never touches the
    // order above and never subtracts from the total either. Its
    // AppliedDiscount row still exists (audit trail, benefit redemption
    // linkage, undo) but plays no part in this sum. Only genuine
    // discounts (manual, percentage, fixed-amount) count toward
    // discountTotal.
    discounts: session.appliedDiscounts
      .filter((d) => d.promotion?.type !== "FREE_ITEM")
      .map((d) => ({ promotionId: d.promotionId, label: d.label, amount: toNum(d.amount) })),
    taxEnabled: checkoutSettings.taxEnabled,
    taxPercent: checkoutSettings.taxPercent,
    serviceChargeEnabled: checkoutSettings.serviceChargeEnabled,
    serviceChargePercent: checkoutSettings.serviceChargePercent,
  });

  return { tableFee, foodDrinkItems, foodDrinkSubtotal, itemsByCategory, bill, checkoutSettings };
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
      const { tableFee, foodDrinkItems, itemsByCategory, bill } = await computeBreakdown(session);

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
        itemsByCategory,
        appliedDiscounts: session.appliedDiscounts.map((d) => ({
          id: d.id,
          promotionId: d.promotionId,
          label: d.label,
          amount: toNum(d.amount),
          appliedByName: d.appliedBy.name,
          // FREE_ITEM's "amount" is the item's own price, offsetting a line
          // that's already in the order at full price — showing "-฿80"
          // next to something labeled "free" reads as a deduction rather
          // than what it actually is, so the bill shows "Free" instead.
          isFreeItem: d.promotion?.type === "FREE_ITEM",
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
      const { tableFee, foodDrinkSubtotal, bill } = await computeBreakdown(session);
      // Redeemed free items are already reflected in foodDrinkSubtotal
      // (their line is zeroed directly) and excluded from bill.discountTotal
      // — subtracting bill.discountTotal here doesn't double-count them.
      const base = Math.max(0, tableFee.total + foodDrinkSubtotal - bill.discountTotal);
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
      const { tableFee, foodDrinkSubtotal, bill } = await computeBreakdown(session);
      const base = Math.max(0, tableFee.total + foodDrinkSubtotal - bill.discountTotal);
      const appliedPromotionIds = new Set(
        session.appliedDiscounts.map((d) => d.promotionId).filter((id): id is string => !!id),
      );
      // The linked member's own earned rewards (§Benefits) — whether from
      // unlocking an achievement or a direct grant (§Direct benefit grants,
      // e.g. a birthday reward), an AVAILABLE BenefitRedemption points
      // straight at the Promotion it grants. Those apply regardless of the
      // promotion's own date/day/spend window — "I earned this" is its own
      // eligibility, not "it happens to be Tuesday."
      const earnedPromotionIds = session.member
        ? new Set(
            (
              await ctx.prisma.benefitRedemption.findMany({
                // expiresAt is set at grant time (benefits.grant) but was
                // never actually checked anywhere — an AVAILABLE reward
                // stayed redeemable forever regardless of its own expiry
                // date (§Benefit expiry enforcement).
                where: {
                  status: "AVAILABLE",
                  memberId: session.member.id,
                  OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
                },
                select: { promotionId: true },
              })
            ).map((r) => r.promotionId),
          )
        : new Set<string>();

      // A promotion a member actually earned (§Benefits) has to be
      // fetchable even if it's since gone inactive for general use —
      // staff turning off a promotion's everyday availability shouldn't
      // also take away a reward someone already unlocked. Only the
      // active ones show for everyone else.
      const promotions = await ctx.prisma.promotion.findMany({
        where: {
          OR: [
            { active: true },
            ...(earnedPromotionIds.size > 0
              ? [{ id: { in: Array.from(earnedPromotionIds) } }]
              : []),
          ],
        },
        include: { rewardMenuItem: { select: { basePrice: true, nameEn: true } } },
      });
      const now = new Date();
      return promotions
        // Stackable (§Stackable promotions) stays eligible for another
        // tap even after already being applied once.
        .filter((p) => p.stackable || !appliedPromotionIds.has(p.id))
        .map(toPromotionConfig)
        .filter(
          (p) =>
            earnedPromotionIds.has(p.id) ||
            isPromotionEligible(p, {
              now,
              hasMember: !!session.member,
              currentSpend: base,
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
            // Flags this row as the member's own earned reward rather than
            // a normally-eligible promotion — checkout-client.tsx tags it
            // "🎁 Your reward" so it doesn't read as an ordinary discount.
            earnedViaBenefit: earnedPromotionIds.has(p.id),
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
      // Stackable (Back Office → Promotions) means exactly this — apply
      // the same promotion more than once to one bill, e.g. a second
      // "Free Potion" on top of one already redeemed. Everything else
      // stays capped at once per bill.
      if (!promotion.stackable && session.appliedDiscounts.some((d) => d.promotionId === promotion.id)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already applied." });
      }

      const { tableFee, foodDrinkSubtotal, bill } = await computeBreakdown(session);
      const base = Math.max(0, tableFee.total + foodDrinkSubtotal - bill.discountTotal);
      const config = toPromotionConfig(promotion);
      // A member's own earned reward (§Benefits) bypasses the normal
      // eligibility check entirely — same reasoning as
      // listEligiblePromotions above. Only look this up if a member is
      // actually linked; findFirst on a null memberId would just be an
      // expensive way to find nothing.
      const earnedRedemption = session.member
        ? await ctx.prisma.benefitRedemption.findFirst({
            // Re-check expiry server-side too (§Benefit expiry
            // enforcement) — a stale client-side eligible list is exactly
            // the kind of thing this apply step already re-verifies below.
            where: {
              status: "AVAILABLE",
              memberId: session.member.id,
              promotionId: promotion.id,
              OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
            },
          })
        : null;
      // Re-check eligibility server-side rather than trusting the client's
      // stale preview — a promotion's window or minimum spend may have
      // moved between the preview query and this click.
      if (
        !earnedRedemption &&
        !isPromotionEligible(config, {
          now: new Date(),
          hasMember: !!session.member,
          currentSpend: base,
        })
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${promotion.name}" isn't eligible for this bill right now.`,
        });
      }
      // FREE_ITEM is a separate gift, not a discount on the bill (see
      // computeBreakdown) — its `amount` here is purely a record of what
      // was given away, so it's the item's own price, not clamped against
      // whatever happens to be left of the bill right now.
      const amount = config.type === "FREE_ITEM" ? config.value : computeDiscountAmount(config, base);
      const label =
        promotion.type === "FREE_ITEM" && promotion.rewardMenuItem
          ? `${promotion.name} (free: ${promotion.rewardMenuItem.nameEn})`
          : promotion.name;

      // One transaction — an earned reward is marked USED in the same
      // write as the discount that redeems it. These used to be two
      // separate calls: if the redemption update failed (or the request
      // dropped) after the discount already landed, the member kept an
      // AVAILABLE reward they'd already spent and could redeem it again
      // on the next bill (§Benefit redemption atomicity).
      await ctx.prisma.$transaction(async (tx) => {
        await tx.appliedDiscount.create({
          data: {
            sessionId: session.id,
            promotionId: promotion.id,
            label,
            amount,
            appliedById: ctx.staff.id,
            // Links this discount back to the specific reward it redeemed
            // (§Benefits) — the Adventurer Profile's Benefits section reads
            // this to show "Redeemed" instead of leaving it AVAILABLE forever.
            benefitRedemptionId: earnedRedemption?.id,
          },
        });
        if (earnedRedemption) {
          await tx.benefitRedemption.update({
            where: { id: earnedRedemption.id },
            data: {
              status: "USED",
              usedAt: new Date(),
              usedById: ctx.staff.id,
              relatedSessionId: session.id,
            },
          });
        }
        await logAudit(tx, {
          staffId: ctx.staff.id,
          action: "PROMOTION_APPLIED",
          entityType: "TableSession",
          entityId: session.id,
          newValue: { promotionId: promotion.id, label, amount },
        });
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
   *
   * Also includes the linked member's own earned-but-currently-inactive
   * promotions (same reasoning as listEligiblePromotions above) — without
   * this, a promotion staff turned off after someone already earned it
   * would silently vanish from the picker entirely, with no way to
   * redeem an already-earned reward at all.
   */
  listAllPromotions: permissionProcedure(Permission.APPLY_DISCOUNTS)
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.prisma.tableSession.findUnique({
        where: { id: input.sessionId },
        select: { memberId: true },
      });
      const earnedPromotionIds = new Set(
        session?.memberId
          ? (
              await ctx.prisma.benefitRedemption.findMany({
                // See listEligiblePromotions' own comment — expiresAt was
                // stored but never checked (§Benefit expiry enforcement).
                where: {
                  status: "AVAILABLE",
                  memberId: session.memberId,
                  OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
                },
                select: { promotionId: true },
              })
            ).map((r) => r.promotionId)
          : [],
      );
      const promotions = await ctx.prisma.promotion.findMany({
        where: {
          OR: [
            { active: true },
            ...(earnedPromotionIds.size > 0 ? [{ id: { in: Array.from(earnedPromotionIds) } }] : []),
          ],
        },
        orderBy: { name: "asc" },
        include: { rewardMenuItem: { select: { nameEn: true } } },
      });
      return promotions.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type as "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_ITEM",
        value: toNum(p.value),
        rewardMenuItemName: p.rewardMenuItem?.nameEn ?? null,
        stackable: p.stackable,
        // Flags a member's own earned-and-unredeemed reward, same as
        // listEligiblePromotions above — the picker uses this to keep
        // "Your rewards" visually separate from ordinary promotions
        // instead of interleaving them in one alphabetical list.
        earnedViaBenefit: earnedPromotionIds.has(p.id),
      }));
    }),

  /**
   * A session's currently applied discounts on their own, independent of
   * the full checkout preview (getPreview needs settings/tax/service-charge
   * context a plain table page doesn't have) — powers PromotionPicker
   * wherever it's dropped in, including the table page before checkout
   * (§Table-page promotions), not just the Checkout screen itself.
   */
  listAppliedDiscounts: cashierProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const discounts = await ctx.prisma.appliedDiscount.findMany({
        where: { sessionId: input.sessionId },
        include: { appliedBy: { select: { name: true } }, promotion: { select: { type: true } } },
        orderBy: { createdAt: "asc" },
      });
      return discounts.map((d) => ({
        id: d.id,
        promotionId: d.promotionId,
        label: d.label,
        amount: toNum(d.amount),
        appliedByName: d.appliedBy.name,
        isFreeItem: d.promotion?.type === "FREE_ITEM",
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
      // See applyPromotion's own comment — Stackable is what lets the
      // same promotion apply more than once to one bill.
      if (!promotion.stackable && session.appliedDiscounts.some((d) => d.promotionId === promotion.id)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already applied." });
      }

      const { tableFee, foodDrinkSubtotal, bill } = await computeBreakdown(session);
      const base = Math.max(0, tableFee.total + foodDrinkSubtotal - bill.discountTotal);
      const config = toPromotionConfig(promotion);

      // See applyPromotion's own comment — FREE_ITEM is a separate gift,
      // not a discount on the bill, so its amount here is just the item's
      // own price, and there's no "was it actually ordered" check (it
      // doesn't need to have been).
      const amount = config.type === "FREE_ITEM" ? config.value : computeDiscountAmount(config, base);
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
      return ctx.prisma.$transaction(async (tx) => {
        const discount = await tx.appliedDiscount.findUnique({
          where: { id: input.discountId },
          include: { session: { select: { id: true, paymentStatus: true } } },
        });
        if (!discount) throw new TRPCError({ code: "NOT_FOUND" });
        // Same guard every other discount mutation on this bill enforces
        // (applyPromotion/applyPromotionOverride/applyManualDiscount) — a
        // paid bill's discounts are locked in, matching its stored bill
        // snapshot. Without this, a discount could be deleted off an
        // already-checked-out bill: the receipt/discountTotal snapshot
        // would still show the original figure while the AppliedDiscount
        // row (and anything reading it, like the promotion-usage report)
        // silently disagreed.
        if (discount.session.paymentStatus === "PAID") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Session already paid." });
        }

        await tx.appliedDiscount.delete({ where: { id: input.discountId } });
        // Removing an earned reward gives it back, same reasoning as
        // voidSession (sessions.ts) — it was marked USED the moment it
        // was applied, before payment, so taking it back off the bill
        // should undo that too, not leave it stuck redeemed for nothing.
        if (discount.benefitRedemptionId) {
          await tx.benefitRedemption.update({
            where: { id: discount.benefitRedemptionId },
            data: { status: "AVAILABLE", usedAt: null, usedById: null, relatedSessionId: null },
          });
        }
        await logAudit(tx, {
          staffId: ctx.staff.id,
          action: "DISCOUNT_REMOVED",
          entityType: "TableSession",
          entityId: discount.session.id,
          previousValue: {
            promotionId: discount.promotionId,
            label: discount.label,
            amount: toNum(discount.amount),
          },
        });
        return { ok: true };
      });
    }),

  recordPayment: cashierProcedure
    .input(
      z.object({
        sessionId: z.string(),
        // No .min(1) — a bill fully wiped out by a 100%-off promotion/
        // discount has a ฿0 total and nothing left to actually pay, so
        // checkout-client.tsx sends an empty array for it (every payment
        // row's amount is clamped to the remaining balance, which is
        // ฿0, then filtered out as not worth recording). The paidTotal
        // vs bill.total check below still enforces correctness for any
        // non-zero bill — an empty array only ever passes it when the
        // total genuinely is ฿0.
        payments: z.array(
          z.object({
            method: z.enum(["CASH", "PROMPTPAY", "CARD", "OTHER"]),
            amount: z.number().positive(),
            reference: z.string().optional(),
            // CASH only — what the customer actually handed over
            // (checkout-client.tsx's change-due calculator). Never part
            // of the money actually owed/recorded (`amount` already is
            // that, and the drawer only ever nets `amount` either way —
            // the ฿100-in/฿40-change split isn't a separate financial
            // fact anything else needs) — carried through only so the
            // receipt can show what was tendered and the change given.
            cashReceived: z.number().positive().optional(),
          }),
        ),
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

        const { tableFee, foodDrinkItems, foodDrinkSubtotal, itemsByCategory, bill } =
          await computeBreakdown(session, tx);
        const paidTotal = input.payments.reduce((s, p) => s + p.amount, 0);
        if (Math.abs(paidTotal - bill.total) > 0.5) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Payment total ฿${paidTotal.toFixed(0)} doesn't match bill total ฿${bill.total.toFixed(0)}.`,
          });
        }

        // One round trip for every payment row instead of N sequential
        // ones — each interactive transaction only gets a few seconds
        // (§getSettings) before Postgres/Prisma calls it expired, so every
        // avoidable round trip here matters.
        await tx.payment.createMany({
          data: input.payments.map((p) => ({
            sessionId: session.id,
            shiftId: openShift.id,
            amount: p.amount,
            method: p.method,
            reference: p.reference,
            staffId: ctx.staff.id,
          })),
        });

        // ── Member EXP / progression (§53) ──────────────────────────────
        let expSummary: {
          expAwarded: number;
          lifetimeExpAfter: number;
          levelBefore: number;
          levelAfter: number;
          rankBefore: string;
          rankAfter: string;
          rankIconAfter: string | null;
        } | null = null;
        let unlockedAchievements: { nameEn: string }[] = [];

        if (session.member) {
          const membershipSettings = await getSettings("membership", tx);
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
            rankIconAfter: after.rank.icon,
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
              classId: session.member.classId,
              ...gameStats,
            },
          );
          // Each achievement's memberAchievement -> benefitRedemption pair
          // has to stay sequential (the redemption needs the row it just
          // created), but different achievements unlocking on the same
          // bill don't depend on each other — run those in parallel
          // rather than one at a time.
          await Promise.all(
            newlyUnlocked.map(async (achievement) => {
              const ma = await tx.memberAchievement.create({
                data: {
                  memberId: session.member!.id,
                  achievementId: achievement.id,
                  sessionId: session.id,
                },
              });
              const promotionId = (achievement as unknown as { promotionId: string | null })
                .promotionId;
              // hasReward with no promotion actually picked shouldn't happen
              // (the achievement editor requires one), but guard it anyway
              // rather than create a redemption pointing at nothing.
              if ((achievement as unknown as { hasReward: boolean }).hasReward && promotionId) {
                await tx.benefitRedemption.create({
                  data: { memberId: session.member!.id, memberAchievementId: ma.id, promotionId },
                });
              }
            }),
          );
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
          itemsByCategory,
          discounts: session.appliedDiscounts.map((d) => ({
            label: d.label,
            amount: toNum(d.amount),
            isFreeItem: d.promotion?.type === "FREE_ITEM",
          })),
          bill,
          payments: input.payments.map((p) => ({
            method: p.method,
            amount: p.amount,
            cashReceived: p.cashReceived,
            change: p.cashReceived != null ? p.cashReceived - p.amount : undefined,
          })),
          // Member details (§Receipt member details) — a self-contained
          // snapshot of who this bill belonged to and where they stood
          // right after it, same §45 reasoning as everything else in
          // here: frozen at payment time, never re-derived later from
          // whatever the member's live record happens to say by then.
          member: session.member
            ? {
                adventurerName: session.member.adventurerName,
                memberCode: session.member.memberCode,
                classNameEn: session.member.class?.nameEn ?? null,
                classIcon: session.member.class?.icon ?? null,
              }
            : null,
          expAwarded: expSummary?.expAwarded ?? 0,
          lifetimeExpAfter: expSummary?.lifetimeExpAfter ?? null,
          levelAfter: expSummary?.levelAfter ?? null,
          rankNameAfter: expSummary?.rankAfter ?? null,
          rankIconAfter: expSummary?.rankIconAfter ?? null,
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

        // A physical table needs cleaning before its next guest, so it goes
        // CLEANING and stays in the floor-plan grid. A Quick Sale table
        // (walk-in/delivery/split — §Quick Sale) has no physical seat to
        // clean and is never reused under the same row — retire it
        // (CLOSED + inactive) so it drops off the Quick Sale list on its
        // own instead of needing a separate "close" action.
        await tx.restaurantTable.update({
          where: { id: session.tableId },
          data:
            session.table.kind === "STANDARD"
              ? { status: "CLEANING" }
              : { status: "CLOSED", active: false },
        });

        return { receiptNumber, bill, expSummary, unlockedAchievements, snapshot };
      });
    }),

  // Only ever meaningful for a physical (STANDARD) table coming back from
  // CLEANING — a Quick Sale table is retired (inactive) at checkout above
  // and never cycles back to AVAILABLE, so this is a no-op for those.
  markTableAvailable: permissionProcedure(Permission.MANAGE_TABLES)
    .input(z.object({ tableId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.restaurantTable.updateMany({
        where: { id: input.tableId, kind: "STANDARD" },
        data: { status: "AVAILABLE" },
      });
      return { ok: true };
    }),
});
