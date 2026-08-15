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
  member: true,
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
 * Flattens every order item into one list with its category attached and
 * redeemed FREE_ITEM units already zeroed out of its own price (§Free item
 * redemptions) — rather than charge full price and subtract a matching
 * discount later, a redeemed unit's price is zeroed right here on the
 * item's own line, so there's no separate "discount" figure anywhere for
 * it; the item is just free, same as if it had never been priced at all.
 * `freeUnitsByMenuItemId` is consumed first-come-first-served across
 * whichever order-item rows actually carry that menu item, in order.
 */
function computeFoodDrinkLines(
  orders: Array<{
    items: Array<{
      id: string;
      nameSnapshotEn: string;
      quantity: number;
      unitPriceSnapshot: unknown;
      menuItemId: string;
      menuItem: { category: { id: string; nameEn: string; sortOrder: number } };
    }>;
  }>,
  freeUnitsByMenuItemId: Map<string, number>,
) {
  const remainingFree = new Map(freeUnitsByMenuItemId);
  return orders.flatMap((order) =>
    order.items.map((i) => {
      const unitPrice = toNum(i.unitPriceSnapshot);
      const available = remainingFree.get(i.menuItemId) ?? 0;
      const freeUnits = Math.min(available, i.quantity);
      if (freeUnits > 0) remainingFree.set(i.menuItemId, available - freeUnits);
      return {
        id: i.id,
        nameEn: i.nameSnapshotEn,
        quantity: i.quantity,
        unitPrice,
        lineTotal: unitPrice * (i.quantity - freeUnits),
        // How many of this line's units are redeemed free — the item's
        // own line simply prices those units at ฿0, nothing to display
        // as a separate discount.
        freeUnits,
        categoryId: i.menuItem.category.id,
        categoryName: i.menuItem.category.nameEn,
        categorySortOrder: i.menuItem.category.sortOrder,
      };
    }),
  );
}

/**
 * Groups the flattened line items by their menu category (Drinks, Snacks,
 * Goods, ...) instead of one blanket "food/drink" bucket — a café selling
 * retail goods alongside food/drink wants those itemized under their own
 * heading, not mislabeled. Uses the live category (same as the Sales by
 * Category report) rather than a stored snapshot: category name/order is
 * a display grouping, not money, so it doesn't need the price/name
 * snapshot treatment — and this whole grouped shape gets written into the
 * receipt's JSON snapshot at payment time regardless, so a printed
 * receipt is still frozen even if the category is renamed later.
 */
function groupItemsByCategory(lines: ReturnType<typeof computeFoodDrinkLines>) {
  const groups = new Map<
    string,
    {
      categoryId: string;
      categoryName: string;
      sortOrder: number;
      subtotal: number;
      items: { id: string; nameEn: string; quantity: number; lineTotal: number; freeUnits: number }[];
    }
  >();
  for (const i of lines) {
    const group = groups.get(i.categoryId) ?? {
      categoryId: i.categoryId,
      categoryName: i.categoryName,
      sortOrder: i.categorySortOrder,
      subtotal: 0,
      items: [],
    };
    group.subtotal += i.lineTotal;
    group.items.push({
      id: i.id,
      nameEn: i.nameEn,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
      freeUnits: i.freeUnits,
    });
    groups.set(i.categoryId, group);
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

  // One free unit consumed per redeemed FREE_ITEM promotion pointing at
  // that menu item — counted here, spent against the actual order lines
  // in computeFoodDrinkLines below.
  const freeUnitsByMenuItemId = new Map<string, number>();
  for (const d of session.appliedDiscounts) {
    if (d.promotion?.type === "FREE_ITEM" && d.promotion.rewardMenuItemId) {
      const id = d.promotion.rewardMenuItemId;
      freeUnitsByMenuItemId.set(id, (freeUnitsByMenuItemId.get(id) ?? 0) + 1);
    }
  }

  const lines = computeFoodDrinkLines(session.orders, freeUnitsByMenuItemId);
  const foodDrinkItems = lines.map(({ id, nameEn, quantity, unitPrice, lineTotal, freeUnits }) => ({
    id,
    nameEn,
    quantity,
    unitPrice,
    lineTotal,
    freeUnits,
  }));
  const foodDrinkSubtotal = lines.reduce((s, i) => s + i.lineTotal, 0);
  const itemsByCategory = groupItemsByCategory(lines);

  const checkoutSettings = await getSettings("checkout", client);
  const bill = computeBill({
    tableFeeTotal: tableFee.total,
    foodDrinkSubtotal,
    // Redeemed free items are already reflected above (their line is
    // zeroed directly) — including them here too would subtract their
    // value a second time. Only genuine discounts (manual, percentage,
    // fixed-amount, other promotion types) count toward discountTotal;
    // FREE_ITEM's AppliedDiscount row still exists (audit trail, benefit
    // redemption linkage, undo), it's just not part of this sum anymore.
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
      const orderedMenuItemIds = new Set(
        session.orders.flatMap((o) => o.items.map((i) => i.menuItemId)),
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
                where: { status: "AVAILABLE", memberId: session.member.id },
                select: { promotionId: true },
              })
            ).map((r) => r.promotionId),
          )
        : new Set<string>();

      const promotions = await ctx.prisma.promotion.findMany({
        where: { active: true },
        include: { rewardMenuItem: { select: { basePrice: true, nameEn: true } } },
      });
      const now = new Date();
      return promotions
        .filter((p) => !appliedPromotionIds.has(p.id))
        .map(toPromotionConfig)
        .filter(
          (p) =>
            earnedPromotionIds.has(p.id) ||
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
      if (session.appliedDiscounts.some((d) => d.promotionId === promotion.id)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already applied." });
      }

      const { tableFee, foodDrinkSubtotal, bill } = await computeBreakdown(session);
      const base = Math.max(0, tableFee.total + foodDrinkSubtotal - bill.discountTotal);
      const orderedMenuItemIds = new Set(
        session.orders.flatMap((o) => o.items.map((i) => i.menuItemId)),
      );
      const config = toPromotionConfig(promotion);
      // A member's own earned reward (§Benefits) bypasses the normal
      // eligibility check entirely — same reasoning as
      // listEligiblePromotions above. Only look this up if a member is
      // actually linked; findFirst on a null memberId would just be an
      // expensive way to find nothing.
      const earnedRedemption = session.member
        ? await ctx.prisma.benefitRedemption.findFirst({
            where: { status: "AVAILABLE", memberId: session.member.id, promotionId: promotion.id },
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
          orderedMenuItemIds,
        })
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${promotion.name}" isn't eligible for this bill right now.`,
        });
      }
      // FREE_ITEM no longer subtracts from the bill as a discount (see
      // computeBreakdown) — its `amount` here is purely a record of what
      // was given away, so it's the item's own price, not clamped against
      // whatever happens to be left of the bill right now.
      const amount = config.type === "FREE_ITEM" ? config.value : computeDiscountAmount(config, base);
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
          // Links this discount back to the specific reward it redeemed
          // (§Benefits) — the Adventurer Profile's Benefits section reads
          // this to show "Redeemed" instead of leaving it AVAILABLE forever.
          benefitRedemptionId: earnedRedemption?.id,
        },
      });
      if (earnedRedemption) {
        await ctx.prisma.benefitRedemption.update({
          where: { id: earnedRedemption.id },
          data: {
            status: "USED",
            usedAt: new Date(),
            usedById: ctx.staff.id,
            relatedSessionId: session.id,
          },
        });
      }
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
      if (session.appliedDiscounts.some((d) => d.promotionId === promotion.id)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already applied." });
      }

      const { tableFee, foodDrinkSubtotal, bill } = await computeBreakdown(session);
      const base = Math.max(0, tableFee.total + foodDrinkSubtotal - bill.discountTotal);
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

      // See applyPromotion's own comment — FREE_ITEM no longer subtracts
      // from the bill, so its amount here is just the item's own price.
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
      const discount = await ctx.prisma.appliedDiscount.findUnique({
        where: { id: input.discountId },
        select: { benefitRedemptionId: true },
      });
      await ctx.prisma.$transaction([
        ctx.prisma.appliedDiscount.delete({ where: { id: input.discountId } }),
        // Removing an earned reward gives it back, same reasoning as
        // voidSession (sessions.ts) — it was marked USED the moment it
        // was applied, before payment, so taking it back off the bill
        // should undo that too, not leave it stuck redeemed for nothing.
        ...(discount?.benefitRedemptionId
          ? [
              ctx.prisma.benefitRedemption.update({
                where: { id: discount.benefitRedemptionId },
                data: { status: "AVAILABLE" as const, usedAt: null, usedById: null, relatedSessionId: null },
              }),
            ]
          : []),
      ]);
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
