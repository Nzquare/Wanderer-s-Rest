import { z } from "zod";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, permissionProcedure, publicProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { toNum } from "@/lib/decimal";
import { computeProgression } from "@/server/domain/exp";
import { getSettings } from "@/server/settings/service";
import { logAudit } from "@/server/audit";

/**
 * Minimal member lookup/creation for POS-side linking (§25), plus a
 * lightweight read-only directory (`browse`) for the Cashier POS
 * "Members" tab. Full profile management (`updateProfile`), EXP/rank
 * adjustments, and the fuller `listAll` directory stay permission-gated
 * below — this top section is deliberately open to every staff member,
 * same as "find or quickly register a member at the till" always was.
 */
export const membersRouter = router({
  search: staffProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      const members = await ctx.prisma.member.findMany({
        where: {
          status: { not: "BANNED" },
          OR: [
            { adventurerName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { memberCode: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
        orderBy: { lastVisit: "desc" },
      });
      return members.map((m) => ({
        id: m.id,
        memberCode: m.memberCode,
        adventurerName: m.adventurerName,
        phone: m.phone,
        lifetimeExp: m.lifetimeExp,
      }));
    }),

  /**
   * Browse/search for the Cashier POS "Members" tab — unlike listAll
   * below, this is staffProcedure (any staff, not just MANAGE_MEMBERS)
   * and deliberately returns a narrower row: no staffNotes or lineUserId,
   * just enough to recognize someone and see their standing at a glance.
   */
  browse: staffProcedure
    .input(z.object({ query: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const q = input?.query?.trim();
      return ctx.prisma.member.findMany({
        where: {
          status: { not: "BANNED" },
          ...(q
            ? {
                OR: [
                  { adventurerName: { contains: q, mode: "insensitive" as const } },
                  { phone: { contains: q } },
                  { memberCode: { contains: q, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          memberCode: true,
          adventurerName: true,
          phone: true,
          lifetimeExp: true,
          rank: { select: { nameEn: true } },
          class: { select: { nameEn: true, icon: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }),

  quickCreate: staffProcedure
    .input(
      z.object({
        adventurerName: z.string().min(1).max(80),
        phone: z.string().max(30).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.phone) {
        const existing = await ctx.prisma.member.findUnique({
          where: { phone: input.phone },
        });
        if (existing) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `A member with phone ${input.phone} already exists (${existing.adventurerName}) — search for them instead.`,
          });
        }
      }
      const member = await ctx.prisma.member.create({
        data: {
          memberCode: `WR-${nanoid(8).toUpperCase()}`,
          adventurerName: input.adventurerName,
          phone: input.phone || null,
        },
      });
      return { id: member.id, adventurerName: member.adventurerName };
    }),

  listAll: permissionProcedure(Permission.MANAGE_MEMBERS)
    .input(z.object({ query: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const q = input?.query?.trim();
      return ctx.prisma.member.findMany({
        where: q
          ? {
              OR: [
                { adventurerName: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
                { memberCode: { contains: q, mode: "insensitive" } },
              ],
            }
          : undefined,
        include: { rank: true, class: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }),

  listRanks: staffProcedure.query(({ ctx }) => {
    return ctx.prisma.rank.findMany({ orderBy: { order: "asc" } });
  }),

  /** The "Adventurer Profile" (§38) — any staff can pull this up for a linked member. */
  getProfile: staffProcedure
    .input(z.object({ memberId: z.string() }))
    .query(async ({ ctx, input }) => {
      const member = await ctx.prisma.member.findUnique({
        where: { id: input.memberId },
        include: {
          class: true,
          rank: true,
          memberAchievements: {
            include: {
              achievement: { include: { promotion: { include: { rewardMenuItem: true } } } },
              benefit: true,
            },
            orderBy: { unlockedAt: "desc" },
          },
          // The full Benefits list, achievement-earned and directly granted
          // alike (§Direct benefit grants) — memberAchievements[].benefit
          // above stays too, just for the per-achievement "Benefit
          // available" note on the Achievements card.
          benefitRedemptions: {
            include: {
              promotion: { include: { rewardMenuItem: true } },
              memberAchievement: { include: { achievement: true } },
            },
            orderBy: { earnedAt: "desc" },
          },
          expHistory: { orderBy: { createdAt: "desc" }, take: 20 },
          gameSessions: { include: { game: true }, orderBy: { playedAt: "desc" }, take: 20 },
        },
      });
      if (!member) throw new TRPCError({ code: "NOT_FOUND" });

      const ranks = await ctx.prisma.rank.findMany({ orderBy: { order: "asc" } });
      const membershipSettings = await getSettings("membership");
      const progression =
        ranks.length > 0
          ? computeProgression(member.lifetimeExp, membershipSettings.expPerLevel, ranks)
          : null;

      return {
        id: member.id,
        memberCode: member.memberCode,
        adventurerName: member.adventurerName,
        phone: member.phone,
        joinDate: member.joinDate,
        status: member.status,
        lastVisit: member.lastVisit,
        visits: member.visits,
        lifetimeExp: member.lifetimeExp,
        lifetimeSpending: toNum(member.lifetimeSpending),
        staffNotes: member.staffNotes,
        class: member.class,
        rank: member.rank,
        progression: progression
          ? {
              totalLevel: progression.totalLevel,
              levelWithinRank: progression.levelWithinRank,
              expIntoLevel: progression.expIntoLevel,
              expForNextLevel: progression.expForNextLevel,
              rankName: progression.rank.nameEn,
            }
          : null,
        achievements: member.memberAchievements.map((ma) => ({
          id: ma.id,
          unlockedAt: ma.unlockedAt,
          note: ma.note,
          achievement: {
            ...ma.achievement,
            // Decimal doesn't survive the wire as a number without this
            // (§45-adjacent: same toNum() convention used everywhere else
            // a Decimal crosses into a tRPC response).
            promotion: ma.achievement.promotion
              ? { ...ma.achievement.promotion, value: toNum(ma.achievement.promotion.value) }
              : null,
          },
          benefit: ma.benefit,
        })),
        // Every benefit this member currently has — achievement-earned and
        // directly granted (§Direct benefit grants) treated the same way,
        // since a member doesn't care which path produced it.
        benefits: member.benefitRedemptions.map((b) => ({
          id: b.id,
          status: b.status,
          earnedAt: b.earnedAt,
          label: b.label,
          achievementNameEn: b.memberAchievement?.achievement.nameEn ?? null,
          icon: b.memberAchievement?.achievement.icon ?? null,
          promotion: { ...b.promotion, value: toNum(b.promotion.value) },
        })),
        expHistory: member.expHistory.map((h) => ({
          id: h.id,
          amount: h.amount,
          reason: h.reason,
          note: h.note,
          createdAt: h.createdAt,
          lifetimeExpAfter: h.lifetimeExpAfter,
        })),
        gameSessions: member.gameSessions.map((g) => ({
          id: g.id,
          playedAt: g.playedAt,
          // A deleted game (§Delete a game) has no live row left to read
          // the name from — GameSession never had a name snapshot.
          gameNameEn: g.game?.nameEn ?? "Deleted game",
        })),
      };
    }),

  /**
   * True delete — only for a member with no recorded history at all
   * (never checked out a bill, no EXP/achievements/games/reservations).
   * Same §45-adjacent pattern as everything else in this app with
   * history attached to it: once there's something real on the record,
   * it stays forever and the member gets marked Inactive/Banned instead
   * (the existing Status field on their profile) rather than deleted.
   */
  remove: permissionProcedure(Permission.MANAGE_MEMBERS)
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.prisma.member.findUnique({
        where: { id: input.memberId },
        include: {
          _count: {
            select: {
              sessions: true,
              expHistory: true,
              memberAchievements: true,
              benefitRedemptions: true,
              gameSessions: true,
              reservations: true,
            },
          },
        },
      });
      if (!member) throw new TRPCError({ code: "NOT_FOUND" });
      const historyCount =
        member._count.sessions +
        member._count.expHistory +
        member._count.memberAchievements +
        member._count.benefitRedemptions +
        member._count.gameSessions +
        member._count.reservations;
      if (historyCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${member.adventurerName}" already has recorded history (visits, EXP, achievements, or reservations) and can't be deleted — set their Status to Inactive or Banned instead.`,
        });
      }
      await ctx.prisma.member.delete({ where: { id: input.memberId } });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "MEMBER_DELETED",
        entityType: "Member",
        entityId: input.memberId,
        previousValue: { adventurerName: member.adventurerName, memberCode: member.memberCode },
      });
      return { ok: true };
    }),

  updateProfile: permissionProcedure(Permission.MANAGE_MEMBERS)
    .input(
      z.object({
        memberId: z.string(),
        classId: z.string().nullable().optional(),
        status: z.enum(["ACTIVE", "INACTIVE", "BANNED"]).optional(),
        staffNotes: z.string().optional(),
        adventurerName: z.string().min(1).optional(),
        phone: z.string().max(30).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { memberId, phone, ...data } = input;
      if (phone) {
        const existing = await ctx.prisma.member.findUnique({ where: { phone } });
        if (existing && existing.id !== memberId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Phone ${phone} is already used by ${existing.adventurerName}.`,
          });
        }
      }
      return ctx.prisma.member.update({
        where: { id: memberId },
        data: { ...data, ...(phone !== undefined ? { phone: phone || null } : {}) },
      });
    }),

  adjustExp: permissionProcedure(Permission.ADJUST_EXP)
    .input(
      z.object({
        memberId: z.string(),
        amount: z.number().int(),
        reason: z.enum(["BONUS", "EVENT", "ADMIN_ADJUSTMENT", "CORRECTION"]),
        note: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const member = await tx.member.findUnique({ where: { id: input.memberId } });
        if (!member) throw new TRPCError({ code: "NOT_FOUND" });

        const newLifetimeExp = Math.max(0, member.lifetimeExp + input.amount);
        const [ranks, membershipSettings] = await Promise.all([
          tx.rank.findMany({ orderBy: { order: "asc" } }),
          getSettings("membership", tx),
        ]);
        const progression =
          ranks.length > 0
            ? computeProgression(newLifetimeExp, membershipSettings.expPerLevel, ranks)
            : null;

        await tx.member.update({
          where: { id: member.id },
          data: {
            lifetimeExp: newLifetimeExp,
            rankId: progression?.rank.id,
          },
        });
        await tx.expHistory.create({
          data: {
            memberId: member.id,
            amount: input.amount,
            reason: input.reason,
            staffId: ctx.staff.id,
            lifetimeExpAfter: newLifetimeExp,
            note: input.note,
          },
        });
        await logAudit(tx, {
          staffId: ctx.staff.id,
          action: "EXP_ADJUSTMENT",
          entityType: "Member",
          entityId: member.id,
          previousValue: { lifetimeExp: member.lifetimeExp },
          newValue: { lifetimeExp: newLifetimeExp },
          reason: `${input.reason}${input.note ? `: ${input.note}` : ""}`,
        });
        return { ok: true, newLifetimeExp };
      });
    }),

  /**
   * Directly set a member's rank (§Rank management — "I need to adjust
   * rank also"). Rank is normally *derived* from lifetimeExp on every EXP
   * change (checkout payment, adjustExp, refund all recompute it via
   * computeProgression) — a bare `rankId` write here would just get
   * silently overwritten the next time any of those run. Instead this
   * sets lifetimeExp to the exact minimum needed to land at level 1 of
   * the chosen rank (sum of every earlier rank's levelsRequired, times
   * EXP-per-level) and records the delta as an ordinary ExpHistory entry
   * — the same mechanism adjustExp already uses, just expressed in terms
   * of "put them in this rank" instead of a raw ± amount, so it never
   * desyncs from the derived model.
   */
  setRank: permissionProcedure(Permission.ADJUST_EXP)
    .input(
      z.object({
        memberId: z.string(),
        rankId: z.string(),
        note: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const [member, ranks, membershipSettings] = await Promise.all([
          tx.member.findUnique({ where: { id: input.memberId } }),
          tx.rank.findMany({ orderBy: { order: "asc" } }),
          getSettings("membership", tx),
        ]);
        if (!member) throw new TRPCError({ code: "NOT_FOUND" });
        const targetIndex = ranks.findIndex((r) => r.id === input.rankId);
        if (targetIndex === -1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Not a valid rank." });
        }
        const target = ranks[targetIndex];

        const levelsBeforeTarget = ranks
          .slice(0, targetIndex)
          .reduce((s, r) => s + r.levelsRequired, 0);
        const targetLifetimeExp = Math.max(
          0,
          levelsBeforeTarget * Math.max(1, membershipSettings.expPerLevel),
        );
        const amount = targetLifetimeExp - member.lifetimeExp;

        await tx.member.update({
          where: { id: member.id },
          data: { lifetimeExp: targetLifetimeExp, rankId: target.id },
        });
        await tx.expHistory.create({
          data: {
            memberId: member.id,
            amount,
            reason: "ADMIN_ADJUSTMENT",
            staffId: ctx.staff.id,
            lifetimeExpAfter: targetLifetimeExp,
            note: `Rank set to ${target.nameEn}${input.note ? ` — ${input.note}` : ""}`,
          },
        });
        await logAudit(tx, {
          staffId: ctx.staff.id,
          action: "RANK_ADJUSTMENT",
          entityType: "Member",
          entityId: member.id,
          previousValue: { rankId: member.rankId, lifetimeExp: member.lifetimeExp },
          newValue: { rankId: target.id, rankName: target.nameEn, lifetimeExp: targetLifetimeExp },
          reason: input.note,
        });
        return { ok: true, newLifetimeExp: targetLifetimeExp, rankName: target.nameEn };
      });
    }),

  /**
   * Fully public "check my profile" lookup (§Member self-service) — a
   * member types the phone number they registered with, no login, same
   * trust model as the table-ordering QR pages (customer.ts): unauthenticated,
   * and deliberately scoped to a narrow, non-sensitive read-only
   * projection. No staffNotes, no lineUserId, no memberCode, no spending
   * figures — just what the fantasy-styled profile itself needs to show
   * (name, class, rank/level/EXP, achievements, visit count). A banned
   * member's phone number returns "not found" rather than exposing status.
   */
  lookupByPhone: publicProcedure
    .input(z.object({ phone: z.string().min(1).max(30) }))
    .query(async ({ ctx, input }) => {
      const phone = input.phone.trim();
      const member = phone
        ? await ctx.prisma.member.findUnique({
            where: { phone },
            include: {
              class: true,
              memberAchievements: {
                include: {
                  achievement: { include: { promotion: { include: { rewardMenuItem: true } } } },
                  benefit: true,
                },
                orderBy: { unlockedAt: "desc" },
              },
              // Achievement-earned and directly granted (§Direct benefit
              // grants — e.g. a birthday reward) benefits alike.
              benefitRedemptions: {
                include: {
                  promotion: { include: { rewardMenuItem: true } },
                  memberAchievement: { include: { achievement: true } },
                },
                orderBy: { earnedAt: "desc" },
              },
            },
          })
        : null;
      if (!member || member.status === "BANNED") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No member found with that phone number.",
        });
      }

      const [ranks, membershipSettings, catalog] = await Promise.all([
        ctx.prisma.rank.findMany({ orderBy: { order: "asc" } }),
        getSettings("membership"),
        ctx.prisma.achievement.findMany({ where: { active: true } }),
      ]);
      const progression =
        ranks.length > 0
          ? computeProgression(member.lifetimeExp, membershipSettings.expPerLevel, ranks)
          : null;

      const unlockedByAchievementId = new Map(
        member.memberAchievements.map((ma) => [ma.achievementId, ma]),
      );

      return {
        adventurerName: member.adventurerName,
        classNameEn: member.class?.nameEn ?? null,
        classIcon: member.class?.icon ?? null,
        joinDate: member.joinDate,
        visits: member.visits,
        progression: progression
          ? {
              totalLevel: progression.totalLevel,
              expIntoLevel: progression.expIntoLevel,
              expForNextLevel: progression.expForNextLevel,
              rankName: progression.rank.nameEn,
              rankIcon: progression.rank.icon,
            }
          : null,
        // Same catalog shape the staff Adventurer Profile shows — unlocked
        // first, hidden/secret ones stay "???" until earned (§32).
        achievements: catalog.map((a) => {
          const unlocked = unlockedByAchievementId.get(a.id);
          return {
            id: a.id,
            nameEn: a.hidden && !unlocked ? null : a.nameEn,
            icon: a.hidden && !unlocked ? null : a.icon,
            hidden: a.hidden,
            unlockedAt: unlocked?.unlockedAt ?? null,
          };
        }),
        // Every benefit this member has, achievement-earned or directly
        // granted (§Direct benefit grants) alike — shown separately from
        // the achievement badge itself, since what a member actually cares
        // about here is "what can I claim," not the trigger that earned it.
        benefits: member.benefitRedemptions.map((b) => ({
          id: b.id,
          achievementNameEn: b.memberAchievement?.achievement.nameEn ?? null,
          icon: b.memberAchievement?.achievement.icon ?? null,
          label: b.label,
          promotionName: b.promotion.name,
          promotionType: b.promotion.type,
          promotionValue: toNum(b.promotion.value),
          rewardMenuItemName: b.promotion.rewardMenuItem?.nameEn ?? null,
          status: b.status,
          earnedAt: b.earnedAt,
          // Only meaningful once redeemed — the self-service History tab
          // (§Benefits history) shows when a used one was actually used.
          usedAt: b.usedAt,
        })),
      };
    }),
});
