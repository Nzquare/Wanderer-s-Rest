import { z } from "zod";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { toNum } from "@/lib/decimal";
import { computeProgression } from "@/server/domain/exp";
import { getSettings } from "@/server/settings/service";
import { logAudit } from "@/server/audit";

/**
 * Minimal member lookup/creation for POS-side linking (§25). Full profile
 * management, EXP history, and achievements live in Back Office (later
 * pass) — this only covers "find or quickly register a member at the till."
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

  listClasses: staffProcedure.query(({ ctx }) => {
    return ctx.prisma.adventurerClass.findMany({
      where: { active: true },
      orderBy: { nameEn: "asc" },
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
            include: { achievement: true, benefit: true },
            orderBy: { unlockedAt: "desc" },
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
          achievement: ma.achievement,
          benefit: ma.benefit,
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
          gameNameEn: g.game.nameEn,
        })),
      };
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
        const ranks = await tx.rank.findMany({ orderBy: { order: "asc" } });
        const membershipSettings = await getSettings("membership");
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
});
