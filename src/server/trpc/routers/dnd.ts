import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { getSettings } from "@/server/settings/service";
import { toNum } from "@/lib/decimal";

const manageDnd = () => permissionProcedure(Permission.MANAGE_GAMES);

export const dndRouter = router({
  listCampaigns: staffProcedure.query(({ ctx }) => {
    return ctx.prisma.dndCampaign.findMany({
      include: { _count: { select: { sessions: true } } },
      orderBy: { createdAt: "asc" },
    });
  }),

  createCampaign: manageDnd()
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ ctx, input }) => ctx.prisma.dndCampaign.create({ data: input })),

  updateCampaign: manageDnd()
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.dndCampaign.update({ where: { id }, data });
    }),

  /** Only for a campaign nobody's logged a session against yet — same "mark Inactive instead" pattern as classes/games/ranks. */
  deleteCampaign: manageDnd()
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.dndCampaign.findUnique({
        where: { id: input.id },
        include: { _count: { select: { sessions: true } } },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      if (campaign._count.sessions > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${campaign.name}" has ${campaign._count.sessions} logged session(s) — mark it Inactive instead, or those sessions lose their campaign.`,
        });
      }
      await ctx.prisma.dndCampaign.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  listSessions: manageDnd()
    .input(
      z
        .object({ from: z.string().optional(), to: z.string().optional(), staffId: z.string().optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.prisma.dndSession.findMany({
        where: {
          ...(input?.from || input?.to
            ? {
                playedAt: {
                  ...(input?.from ? { gte: new Date(input.from) } : {}),
                  ...(input?.to ? { lte: new Date(`${input.to}T23:59:59`) } : {}),
                },
              }
            : {}),
          ...(input?.staffId ? { staffId: input.staffId } : {}),
        },
        include: {
          campaign: { select: { name: true } },
          staff: { select: { name: true, displayName: true } },
        },
        orderBy: { playedAt: "desc" },
      });
      return sessions.map((s) => ({
        ...s,
        tableFeeAmount: toNum(s.tableFeeAmount),
        commissionAmount: toNum(s.commissionAmount),
      }));
    }),

  record: manageDnd()
    .input(
      z.object({
        type: z.enum(["ONE_SHOT", "CAMPAIGN"]),
        campaignId: z.string().optional(),
        staffId: z.string(),
        tableFeeAmount: z.number().positive(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.type === "CAMPAIGN" && !input.campaignId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a campaign for a campaign session." });
      }

      const { commissionPercent } = await getSettings("dnd");
      // tableFeeAmount * commissionPercent / 100, rounded to 2 decimals (satang).
      const commissionAmount = Math.round(input.tableFeeAmount * commissionPercent) / 100;

      return ctx.prisma.$transaction(async (tx) => {
        let sessionNumber: number | null = null;
        if (input.type === "CAMPAIGN" && input.campaignId) {
          sessionNumber = (await tx.dndSession.count({ where: { campaignId: input.campaignId } })) + 1;
        }
        return tx.dndSession.create({
          data: {
            type: input.type,
            campaignId: input.type === "CAMPAIGN" ? input.campaignId : null,
            sessionNumber,
            staffId: input.staffId,
            tableFeeAmount: input.tableFeeAmount,
            commissionPercent,
            commissionAmount,
            notes: input.notes,
          },
        });
      });
    }),

  /** A correction tool, not an everyday action — removes the logged session (and its commission) entirely. */
  delete: manageDnd()
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.dndSession.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /** Per-DM commission totals for a date range — what the owner actually pays out. */
  commissionSummary: manageDnd()
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.prisma.dndSession.findMany({
        where: { playedAt: { gte: new Date(input.from), lte: new Date(`${input.to}T23:59:59`) } },
        include: { staff: { select: { id: true, name: true, displayName: true } } },
      });

      const byStaff = new Map<
        string,
        { staffId: string; name: string; sessionCount: number; totalCommission: number }
      >();
      for (const s of sessions) {
        const existing = byStaff.get(s.staffId) ?? {
          staffId: s.staffId,
          name: s.staff.displayName ?? s.staff.name,
          sessionCount: 0,
          totalCommission: 0,
        };
        existing.sessionCount += 1;
        existing.totalCommission += toNum(s.commissionAmount);
        byStaff.set(s.staffId, existing);
      }
      return Array.from(byStaff.values()).sort((a, b) => b.totalCommission - a.totalCommission);
    }),
});
